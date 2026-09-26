#!/usr/bin/env ucode

function as_string(value) {
    return value == null ? "" : "" + value;
}

function decimal_text(value, strict) {
    value = as_string(value);
    if (value == "" || match(value, /^[0-9]+$/) == null)
        return false;
    return !strict || length(value) == 1 || substr(value, 0, 1) != "0";
}

function valid_ipv4(value, allow_trailing_dot, strict_decimal) {
    value = as_string(value);
    if (allow_trailing_dot && length(value) > 0 && substr(value, length(value) - 1, 1) == ".")
        value = substr(value, 0, length(value) - 1);

    let parts = split(value, ".");
    if (length(parts) != 4)
        return false;

    for (let part in parts) {
        if (!decimal_text(part, strict_decimal))
            return false;

        let octet = int(part);
        if (octet < 0 || octet > 255)
            return false;
    }

    return true;
}

function valid_ipv4_cidr(value, strict_decimal) {
    value = as_string(value);
    let slash = index(value, "/");
    if (slash <= 0 || index(substr(value, slash + 1), "/") >= 0)
        return false;

    let prefix = substr(value, slash + 1);
    if (!decimal_text(prefix, strict_decimal))
        return false;

    let prefix_number = int(prefix);
    return valid_ipv4(substr(value, 0, slash), false, strict_decimal) && prefix_number >= 0 && prefix_number <= 32;
}

function valid_ipv6_hextet(value) {
    value = as_string(value);
    return value != "" && length(value) <= 4 && match(value, /^[0-9A-Fa-f]+$/) != null;
}

function ipv6_parts_count(parts) {
    let count = 0;

    for (let i = 0; i < length(parts); i++) {
        let part = parts[i];
        if (part == "")
            return -1;

        if (index(part, ".") >= 0) {
            if (i != length(parts) - 1 || !valid_ipv4(part, false, false))
                return -1;
            count += 2;
            continue;
        }

        if (!valid_ipv6_hextet(part))
            return -1;
        count++;
    }

    return count;
}

function valid_ipv6(value) {
    value = as_string(value);
    if (value == "" || index(value, "/") >= 0 || index(value, "%") >= 0)
        return false;

    let marker = index(value, "::");
    if (marker >= 0) {
        if (index(substr(value, marker + 2), "::") >= 0)
            return false;

        let left = substr(value, 0, marker);
        let right = substr(value, marker + 2);
        let left_count = left == "" ? 0 : ipv6_parts_count(split(left, ":"));
        let right_count = right == "" ? 0 : ipv6_parts_count(split(right, ":"));

        return left_count >= 0 && right_count >= 0 && left_count + right_count < 8;
    }

    let count = ipv6_parts_count(split(value, ":"));
    return count == 8;
}

function valid_ipv6_cidr(value) {
    value = as_string(value);
    let slash = index(value, "/");
    if (slash <= 0 || index(substr(value, slash + 1), "/") >= 0)
        return false;

    let prefix = substr(value, slash + 1);
    if (!decimal_text(prefix, false))
        return false;

    let prefix_number = int(prefix);
    return valid_ipv6(substr(value, 0, slash)) && prefix_number >= 0 && prefix_number <= 128;
}

function valid_ip(value) {
    return valid_ipv4(value, false, false) || valid_ipv6(value);
}

function valid_ip_cidr(value) {
    return valid_ipv4_cidr(value, false) || valid_ipv6_cidr(value);
}

function valid_ip_or_cidr(value) {
    return valid_ip(value) || valid_ip_cidr(value);
}

function nft_ip_or_cidr(value) {
    return valid_ipv4(value, true, true) || valid_ipv4_cidr(value, true) || valid_ipv6(value) || valid_ipv6_cidr(value);
}

function ip_family(value) {
    return valid_ipv4(value, false, false) || valid_ipv4_cidr(value, false) ? 4 :
        (valid_ipv6(value) || valid_ipv6_cidr(value) ? 6 : 0);
}

function valid_mac(value) {
    return match(as_string(value), /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/) != null;
}

function ipv4_bits(value) {
    let result = [];
    for (let part in split(as_string(value), ".")) {
        let octet = int(part);
        for (let bit = 7; bit >= 0; bit--)
            push(result, (octet >> bit) & 1);
    }
    return result;
}

function ipv6_hextets(value) {
    value = as_string(value);
    let embedded = [];
    let last_colon = rindex(value, ":");
    if (index(substr(value, last_colon + 1), ".") >= 0) {
        let octets = split(substr(value, last_colon + 1), ".");
        embedded = [ sprintf("%x", int(octets[0]) * 256 + int(octets[1])), sprintf("%x", int(octets[2]) * 256 + int(octets[3])) ];
        value = substr(value, 0, last_colon + 1) + "0";
    }

    let marker = index(value, "::");
    let parts;
    if (marker >= 0) {
        let left = substr(value, 0, marker);
        let right = substr(value, marker + 2);
        let left_parts = left == "" ? [] : split(left, ":");
        let right_parts = right == "" ? [] : split(right, ":");
        if (length(embedded) > 0)
            right_parts = slice(right_parts, 0, length(right_parts) - 1);
        let missing = 8 - length(left_parts) - length(right_parts) - length(embedded);
        parts = [ ...left_parts ];
        for (let i = 0; i < missing; i++)
            push(parts, "0");
        push(parts, ...right_parts);
    }
    else {
        parts = split(value, ":");
        if (length(embedded) > 0)
            parts = slice(parts, 0, length(parts) - 1);
    }
    push(parts, ...embedded);
    return map(parts, (part) => hex(part));
}

function ipv6_bits(value) {
    let result = [];
    for (let hextet in ipv6_hextets(value))
        for (let bit = 15; bit >= 0; bit--)
            push(result, (hextet >> bit) & 1);
    return result;
}

// Returns true when a single IP address belongs to an IP or CIDR value of the same family.
function ip_in_cidr(ip, cidr) {
    ip = as_string(ip);
    cidr = as_string(cidr);
    let slash = index(cidr, "/");
    let network = slash >= 0 ? substr(cidr, 0, slash) : cidr;
    let family = ip_family(ip);

    if (family == 0 || family != ip_family(network))
        return false;
    if (family == 4 && !valid_ipv4(ip, false, false))
        return false;
    if (family == 6 && !valid_ipv6(ip))
        return false;

    let max_prefix = family == 4 ? 32 : 128;
    let prefix = slash >= 0 ? int(substr(cidr, slash + 1)) : max_prefix;
    let ip_bits = family == 4 ? ipv4_bits(ip) : ipv6_bits(ip);
    let network_bits = family == 4 ? ipv4_bits(network) : ipv6_bits(network);

    for (let i = 0; i < prefix && i < max_prefix; i++)
        if (ip_bits[i] != network_bits[i])
            return false;
    return true;
}

function format_ipv6_tproxy_target(address, port) {
    address = as_string(address);
    if (substr(address, 0, 1) == "[" && substr(address, length(address) - 1, 1) == "]")
        return address + ":" + as_string(port);
    return "[" + address + "]:" + as_string(port);
}

return {
    valid_ipv4,
    valid_ipv4_cidr,
    valid_ipv6,
    valid_ipv6_cidr,
    valid_ip,
    valid_ip_cidr,
    valid_ip_or_cidr,
    nft_ip_or_cidr,
    ip_family,
    valid_mac,
    ip_in_cidr,
    format_ipv6_tproxy_target
};

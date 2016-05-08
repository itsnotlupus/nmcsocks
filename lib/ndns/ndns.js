/*
  XSXSXS
*/

var sys = require ('sys');
var util = require ('util');

var debug;
var debugLevel = parseInt (process.env.NODE_DEBUG, 16);
if (debugLevel & 0x4) {
	debug = function (x) { console.error ('NDNS: ' + x); };
} else {
	debug = function () { };
}

var dgram = require ('dgram');
var events = require ('events');

var ns_packsiz = 512;	// Default UDP Packet size
var ns_maxdname = 1025;	// Maximum domain name
var ns_maxmsg = 65535;	// Maximum message size
var ns_maxcdname = 255;	// Maximum compressed domain name
var ns_maxlabel = 63;	// Maximum compressed domain label
var ns_hfixedsz = 12;	// Bytes of fixed data in header
var ns_qfixedsz = 4;	// Bytes of fixed data in query
var ns_rrfixedsz = 10;	// Bytes of fixed data in r record
var ns_int32sz = 4;	// Bytes of data in a u_int32_t
var ns_int16sz = 2;	// Bytes of data in a u_int16_t
var ns_int8sz = 1;	// Bytes of data in a u_int8_t
var ns_inaddrsz = 4;	// IPv4 T_A
var ns_in6addrsz = 16;	// IPv6 T_AAAA
var ns_cmprsflgs = 0xc0;// Flag bits indicating name compression.
var ns_defaultport = 53;// For both UDP and TCP.

var ns_s = { // sect
	'qd': 0,	// Query: Question.
	'zn': 0,	// Update: Zone.
	'an': 1,	// Query: Answer.
	'pr': 1,	// Update: Prerequisites.
	'ns': 2,	// Query: Name servers.
	'ud': 2,	// Query: Update.
	'ar': 3,	// Query|Update: Additional records.
	'max': 4,
};
exports.ns_s = ns_s;

var ns_f = { // flag
	'qr': 0,	// Question/Response.
	'opcode': 1,	// Operation code.
	'aa': 2,	// Authorative Answer.
	'tc': 3,	// Truncation occured.
	'rd': 4,	// Recursion Desired.
	'ra': 5,	// Recursion Available.
	'z': 6,	// MBZ
	'ad': 7,	// Authentic Data (DNSSEC)
	'cd': 8,	// Checking Disabled (DNSSEC)
	'rcode': 9,	// Response code.
	'max': 10,
};
exports.ns_f = ns_f;

// Currently defined opcodes.
var ns_opcode = {
	'query': 0, 	// Standard query.
	'iquery': 1,	// Inverse query (deprecated/unsupported).
	'status': 2, 	// Name server status query (unsupported).
			// Opcode 3 is undefined/reserved
	'notify': 4,	// Zone change notification.
	'update': 5,	// Zone update message.
};
exports.ns_opcode = ns_opcode;

// Currently defined response codes
var ns_rcode = {
	'noerror': 0,	// No error occured.
	'formerr': 1,	// Format error.
	'servfail': 2,	// Server failure.
	'nxdomain': 3,	// Name error.
	'notimpl': 4,	// Unimplemented.
	'refused': 5,	// Operation refused.
// These are for BIND_UPDATE
	'yxdomain': 6,	// Name exists
	'yxrrset': 7,	// RRset exists
	'nxrrset': 8,	// RRset does not exist
	'notauth': 9,	// Not authorative for zone
	'notzone': 10,	// Zone of record different from zone section
	'max': 11,
// The following are EDNS extended rcodes
	'badvers': 16,
// The following are TSIG errors
	'badsig': 16,
	'badkey': 17,
	'badtime': 18,
};
exports.ns_rcode = ns_rcode;

// BIND_UPDATE
var ns_oup = { // update_operation
	'delete': 0,
	'add': 1,
	'max': 2,
};
exports.ns_oup = ns_oup;

var NS_TSIG = {
	'FUDGE': 300,
	'TCP_COUNT': 100,
	'ALG_HMAC_MD5': "HMAC-MD5.SIG-ALG.REG.INT",
	
	'ERROR_NO_TSIG': -10,
	'ERROR_NO_SPACE': -11,
	'ERROR_FORMERR': -12,
};
exports.NS_TSIG = NS_TSIG;

// Currently defined type values for resources and queries.
var ns_t = { // type
	'invalid': 0,	// Cookie.
	'a': 1,	// Host address.
	'ns': 2,	// Authorative server.
	'md': 3,	// Mail destinaion.
	'mf': 4,	// Mail forwarder.
	'cname': 5,	// Canonical name.
	'soa': 6,	// Start of authority zone.
	'mb': 7,	// Mailbox domain name.
	'mg': 8,	// Mail group member.
	'mr': 9,	// Mail rename name.
	'null': 10,	// Null resource record.
	'wks': 11,	// Well known service.
	'ptr': 12,	// Domain name pointer.
	'hinfo': 13,	// Host information.
	'minfo': 14,	// Mailbox information.
	'mx': 15,	// Mail routing information.
	'txt': 16,	// Text strings.
	'rp': 17,	// Responsible person.
	'afsdb': 18,	// AFS cell database.
	'x25': 19,	// X_25 calling address.
	'isdn': 20,	// ISDN calling address.
	'rt': 21,	// Router.
	'nsap': 22,	// NSAP address.
	'ns_nsap_ptr': 23,	// Reverse NSAP lookup (deprecated)
	'sig': 24,	// Security signature.
	'key': 25,	// Security key.
	'px': 26,	// X.400 mail mapping.
	'gpos': 27,	// Geographical position (withdrawn).
	'aaaa': 28,	// Ip6 Address.
	'loc': 29,	// Location Information.
	'nxt': 30,	// Next domain (security)
	'eid': 31,	// Endpoint identifier.
	'nimloc': 32,	// Nimrod Locator.
	'srv': 33,	// Server Selection.
	'atma': 34,	// ATM Address
	'naptr': 35,	// Naming Authority PoinTeR
	'kx': 36,	// Key Exchange
	'cert': 37,	// Certification Record
	'a6': 38,	// IPv6 Address (deprecated, use ns_t.aaaa)
	'dname': 39,	// Non-terminal DNAME (for IPv6)
	'sink': 40,	// Kitchen sink (experimental)
	'opt': 41,	// EDNS0 option (meta-RR)
	'apl': 42,	// Address prefix list (RFC3123)
	'ds': 43,	// Delegation Signer
	'sshfp': 44,	// SSH Fingerprint
	'ipseckey': 45,// IPSEC Key
	'rrsig': 46,	// RRSet Signature
	'nsec': 47,	// Negative Security
	'dnskey': 48,	// DNS Key
	'dhcid': 49,	// Dynamic host configuartion identifier
	'nsec3': 50,	// Negative security type 3
	'nsec3param': 51,	// Negative security type 3 parameters
	'hip': 55,	// Host Identity Protocol
	'spf': 99,	// Sender Policy Framework
	'tkey': 249,	// Transaction key
	'tsig': 250,	// Transaction signature.
	'ixfr': 251,	// Incremental zone transfer.
	'axfr': 252,	// Transfer zone of authority.
	'mailb': 253,	// Transfer mailbox records.
	'maila': 254,	// Transfer mail agent records.
	'any': 255,	// Wildcard match.
	'zxfr': 256,	// BIND-specific, nonstandard.
	'dlv': 32769,	// DNSSEC look-aside validation.
	'max': 65536
};
exports.ns_t = ns_t;

// Values for class field
var ns_c = { // class
	'invalid':  0,	// Cookie.
	'in': 1,	// Internet.
	'2': 2,	// unallocated/unsupported.
	'chaos': 3,	// MIT Chaos-net.
	'hs': 4,	// MIT Hesoid.
	// Query class values which do not appear in resource records
	'none': 254,	// for prereq. sections in update requests
	'any': 255,	// Wildcard match.
	'max': 65535,
};
exports.ns_c = ns_c;

// DNSSEC constants.
var ns_kt = { // key_type
	'rsa': 1,	// key type RSA/MD5
	'dh': 2,	// Diffie Hellman
	'dsa': 3,	// Digital Signature Standard (MANDATORY)
	'private': 4	// Private key type starts with OID
};
exports.ns_kt = ns_kt;

var cert_t = { // cert_type
	'pkix': 1,	// PKIX (X.509v3)
	'spki': 2,	// SPKI
	'pgp': 3, 	// PGP
	'url': 253,	// URL private type
	'oid': 254	// OID private type
};
exports.cert_t = cert_t;

var ns_s = {
	qd: 0,
	zn: 0,
	an: 1,
	pr: 1,
	ns: 2,
	ud: 2,
	ar: 3,
	max: 4
};
exports.ns_s = ns_s;

// Flags field of the KEY RR rdata

var ns_type_elt = 0x40; // edns0 extended label type
var dns_labeltype_bitstring = 0x41;
var digitvalue = [
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 16
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 32
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 48
	0,  1,  2,  3,  4,  5,  6,  7,  8,  9, -1, -1, -1, -1, -1, -1, // 64
	-1, 10, 11, 12, 13, 14, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 80
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 96
	-1, 12, 11, 12, 13, 14, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 112
    	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 128
    	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
	-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 256
	];

var hexvalue = [
	"00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f", 
	"10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1a", "1b", "1c", "1d", "1e", "1f", 
	"20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", 
	"30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3a", "3b", "3c", "3d", "3e", "3f", 
	"40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4a", "4b", "4c", "4d", "4e", "4f", 
	"50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5a", "5b", "5c", "5d", "5e", "5f", 
	"60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6a", "6b", "6c", "6d", "6e", "6f", 
	"70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f", 
	"80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8a", "8b", "8c", "8d", "8e", "8f", 
	"90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9a", "9b", "9c", "9d", "9e", "9f", 
	"a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "ac", "ad", "ae", "af", 
	"b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "ba", "bb", "bc", "bd", "be", "bf", 
	"c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "ca", "cb", "cc", "cd", "ce", "cf", 
	"d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "dc", "dd", "de", "df", 
	"e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "ea", "eb", "ec", "ed", "ee", "ef", 
	"f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "fa", "fb", "fc", "fd", "fe", "ff", 
	];

var digits = "0123456789";
var ns_flagdata = [
	{ mask: 0x8000, shift: 15 }, // qr.
	{ mask: 0x7800, shift: 11 }, // opcode.
	{ mask: 0x0400, shift: 10 }, // aa.
	{ mask: 0x0200, shift: 9 }, // tc.
	{ mask: 0x0100, shift: 8 }, // rd.
	{ mask: 0x0080, shift: 7 }, // ra.
	{ mask: 0x0040, shift: 6 }, // z.
	{ mask: 0x0020, shift: 5 }, // ad.
	{ mask: 0x0010, shift: 4 }, // cd.
	{ mask: 0x000f, shift: 0 }, // rcode.
	{ mask: 0x0000, shift: 0 }, // expansion (1/6).
	{ mask: 0x0000, shift: 0 }, // expansion (2/6).
	{ mask: 0x0000, shift: 0 }, // expansion (3/6).
	{ mask: 0x0000, shift: 0 }, // expansion (4/6).
	{ mask: 0x0000, shift: 0 }, // expansion (5/6).
	{ mask: 0x0000, shift: 0 }, // expansion (6/6).
	];

var res_opcodes = [
	"QUERY",
	"IQUERY",
	"CQUERYM",
	"CQUERYU",	// experimental
	"NOTIFY",	// experimental
	"UPDATE",
	"6",
	"7",
	"8",
	"9",
	"10",
	"11",
	"12",
	"13",
	"ZONEINIT",
	"ZONEREF",
	];
var res_sectioncodes = [
	"ZONE",
	"PREREQUISITES",
	"UPDATE",
	"ADDITIONAL",
	];

var p_class_syms = {
	1: "IN",
	3: "CHAOS",
	4: "HESOID",
	254: "ANY",
	255: "NONE"
};
exports.p_class_syms = p_class_syms;

var p_default_section_syms = {
	0: "QUERY",
	1: "ANSWER",
	2: "AUTHORITY",
	3: "ADDITIONAL"
};
exports.p_default_section_syms = p_default_section_syms;

var p_key_syms = {
	1: ["RSA", "RSA KEY with MD5 hash"],
	2: ["DH", "Diffie Hellman"],
	3: ["DSA", "Digital Signature Algorithm"],
	4: ["PRIVATE", "Algorithm obtained from OID"]
};
exports.p_key_syms = p_key_syms;

var p_cert_syms = {
	1: ["PKIX", "PKIX (X.509v3) Certificate"],
	2: ["SKPI", "SPKI Certificate"],
	3: ["PGP", "PGP Certificate"],
	253: ["URL", "URL Private"],
	254: ["OID", "OID Private"]
};
exports.p_cert_syms = p_cert_syms;

var p_type_syms = {
	1: "A",
	2: "NS",
	3: "MD",
	4: "MF",
	5: "CNAME",
	6: "SOA",
	7: "MB",
	8: "MG",
	9: "MR",
	10: "NULL",
	11: "WKS",
	12: "PTR",
	13: "HINFO",
	14: "MINFO",
	15: "MX",
	16: "TXT",
	17: "RP",
	18: "AFSDB",
	19: "X25",
	20: "ISDN",
	21: "RT",
	22: "NSAP",
	23: "NSAP_PTR",
	24: "SIG",
	25: "KEY",
	26: "PX",
	27: "GPOS",
	28: "AAAA",
	29: "LOC",
	30: "NXT",
	31: "EID",
	32: "NIMLOC",
	33: "SRV",
	34: "ATMA",
	35: "NAPTR",
	36: "KX",
	37: "CERT",
	38: "A6",
	39: "DNAME",
	40: "SINK",
	41: "OPT",
	42: "APL",
	43: "DS",
	44: "SSHFP",
	45: "IPSECKEY",
	46: "RRSIG",
	47: "NSEC",
	48: "DNSKEY",
	49: "DHCID",
	50: "NSEC3",
	51: "NSEC3PARAM",
	55: "HIP",
	99: "SPF",
	249: "TKEY",
	250: "TSIG",
	251: "IXFR",
	252: "AXFR",
	253: "MAILB",
	254: "MAILA",
	255: "ANY",
	32769: "DLV",
	256: "ZXFR",
};
exports.p_type_syms = p_type_syms;

var p_rcode_syms = {
	0: ["NOERROR", "no error"],
	1: ["FORMERR", "format error"],
	2: ["SERVFAIL", "server failed"],
	3: ["NXDOMAIN", "no such domain name"],
	4: ["NOTIMP", "not implemented"],
	5: ["REFUSED", "refused"],
// These are for BIND_UPDATE
	6: ["YXDOMAIN", "domain name exist"],
	7: ["YXRRSET", "rrset exists"],
	8: ["NXRRSET", "rrset doesn't exist"],
	9: ["NOTAUTH", "not authorative"],
	10: ["NOTZONE", "not in zone"],
	11: ["", ""],
// The following are EDNS extended rcodes
// The following are TSIG errors
	16: ["BADSIG", "bad signature"],
	17: ["BADKEY", "bad key"],
	18: ["BADTIME", "bad time"]
};
exports.p_rcode_syms = p_rcode_syms;

function Ptr (val) {
	this.p = val;
}
exports.Ptr = Ptr;

Ptr.prototype.get = function () {
	return this.p;
};

Ptr.prototype.set = function (val) {
	return this.p = val;
};

var errno = "";

var _string = new Buffer (ns_maxdname);
var _dname = new Buffer (ns_maxdname);
var _cdname = new Buffer (ns_maxcdname);
var _map = new Array (8192);
var _ptr = new Ptr ();

function ns_name_ntop (src, dst, dstsiz) {
	var cp;
	var dn, eom;
	var c;
	var n;
	var l;
	
	cp = 0;
	dn = 0;
	eom = dstsiz;
	
	while ((n = src[cp++]) != 0) {
		if ((n & ns_cmprsflgs) == ns_cmprsflgs) {
			/* some kind of compression pointer */
			errno = 'EMSGSIZE';
			return (-1);
		}
		if (dn != 0) {
			if(dn >= eom) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			dst[dn++] = 0x2e; /* '.' */
		}
		if ((l = labellen(src, cp - 1)) < 0) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		if (dn + l >= eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		if ((n & ns_cmprsflgs) == ns_type_elt) {
			var m;
			
			if (n != dns_labeltype_bitstring) {
				/* labellen should reject this case */
				return (-1);
			}
			var cpp = new Ptr (cp);
			if ((m = decode_bitstring (src, cpp, dst, dn, eom)) < 0) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			cp = cpp.get ();
			dn += m;
			continue;
		}
		for(; l > 0; l--) {
			c = src[cp++];
			if (special(c)) {
				if (dn + 1 >= eom) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				dst[dn++] = 0x5c; /* '\\' */
				dst[dn++] = c;
			}
			else if (!printable(c)) {
				if (dn + 3 >= eom) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				dst[dn++] = 0x5c; /* '\\' */
				dst[dn++] = digits[c / 100];
				dst[dn++] = digits[(c % 100) / 10];
				dst[dn++] = digits[c % 10];
			}
			else {
				if (dn >= eom) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				dst[dn++] = c;
			}
		}
	}
	if (dn == 0) {
		if (dn >= eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		dst[dn++] = 0x2e; // '.'
	}
	if (dn >= eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	dst[dn] = 0;
	return (dn);
}
exports.ns_name_ntop = ns_name_ntop;

function ns_name_pton (src, dst, dstsiz) {
	return ns_name_pton2(src, dst, dstsiz, null);
}
exports.ns_name_pton = ns_name_pton;

function ns_name_pton2 (src, dst, dstsiz, dstlenp) {
	var label, bp, eom;
	var c, n, escaped, e = 0;
	var cp;
	
	escaped = 0;
	bp = 0;
	eom = dstsiz;
	label = bp++;
	
	var srcn = 0;
	var done = false; // instead of goto
	while ((c = src[srcn++]) != 0) {
		if (escaped) {
			if (c == 91) { // '['; start a bit string label
				if ((cp = strchr (src, srcn, 93)) == null) { // ']'
					errno = 'EINVAL';
					return (-1);
				}
				var srcp = new Ptr (srcn);
				var bpp = new Ptr (bp);
				var labelp = new Ptr (label);
				if ((e = encode_bitstring (src, srcp, cp + 2,
							   labelp, dst, bpp, eom)
				     != 0)) {
					errno = e;
					return (-1);
				}
				label = labelp.get ();
				bp = bpp.get ();
				srcn = srcp.get ();
				escaped = 0;
				label = bp++;
				if ((c = src[srcn++]) == 0) {
					done = true;
					break;
				}
			}
			else if ((cp = digits.indexOf (String.fromCharCode(c))) != -1) {
				n = (cp * 100);
				if ((c = src[srcn++]) ||
				    (cp = digits.indexOf (String.fromCharCode(c))) == -1) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				n += (cp) * 10;
				if ((c = src[srcn++]) == 0 ||
				    (cp = digits.indexOf (String.fromCharCode(c))) == -1) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				n += cp;
				if (n > 255) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				c = n;
			}
			escaped = 0;
		} else if (c == 92) { // '\\'
			escaped = 1;
			continue;
		} else if (c == 46) { // '.'
			c = (bp - label - 1);
			if ((c & ns_cmprsflgs) != 0) { // label too big
					errno = 'EMSGSIZE';
					return (-1);
				}
			if (label >= eom) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			dst[label] = c;
			// Fully qualified?
			if (src[srcn] == 0) {
				if (c != 0) {
					if (bp >= eom) {
						errno = 'EMSGSIZE';
						return (-1);
					}
					dst[bp++] = 0;
				}
				if ((bp) > ns_maxcdname) {
					errno = 'EMSGSIZE';
					return (-1);
				}
				if (dstlenp != null) {
					dstlenp.set(bp);
				}
				return (1);
			}
			if (c == 0 || src[srcn] == 46) { // '.'
				errno = 'EMSGSIZE';
				return (-1);
			}
			label = bp++;
			continue;
		}
		if (bp >= eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		dst[bp++] = c;
	}
	if (!done) {
		c = (bp - label - 1);
		if ((c & ns_cmprsflgs) != 0) {
			errno = 'EMSGSIZE';
			return (-1);
		}
	}
// done:
	if (label >= eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	dst[label] = c;
	if (c != 0) {
		if (bp >= eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		dst[bp++] = 0;
	}
	if (bp > ns_maxcdname) { // src too big
		errno = 'EMSGSIZE';
		return (-1);
	}
	if (dstlenp != null) {
		dstlenp.set(bp);
	}
	return (0);
}
exports.ns_name_pton2 = ns_name_pton2;

function strchr (src, off, n) {
	while (off < buf.length && buf[off] != 0) {
		if (buf[off] == n)
			return off;
		off++;
	}
	return null;
}

function ns_name_unpack (msg, offset, len, dst, dstsiz) {
	return ns_name_unpack2 (msg, offset, len, dst, dstsiz, null);
}
exports.ns_name_unpack = ns_name_unpack;

function ns_name_unpack2 (msg, offset, len, dst, dstsiz, dstlenp) {
	var n, l;
	
	var llen = -1;
	var checked = 0;
	var dstn = 0;
	var srcn = offset;
	var dstlim = dstsiz;
	var eom = offset + len;
	if (srcn < 0 || srcn >= eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	/* Fetch next label in domain name */
	while ((n = msg[srcn++]) != 0 && !isNaN(srcn)) {
		/* Check for indirection */
		switch (n & ns_cmprsflgs) {
		case 0:
		case ns_type_elt:
			/* Limit checks */
			
			if ((l = labellen (msg, srcn - 1)) < 0) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			if (dstn + l + 1 >= dstlim || srcn + l >= eom) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			checked += l + 1;
			dst[dstn++] = n;
			msg.copy (dst, dstn, srcn, srcn + l);
			dstn += l;
			srcn += l;
			break;
			
		case ns_cmprsflgs:
			if (srcn >= eom) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			if (llen < 0) {
				llen = (srcn - offset) + 1;
			}
			
			srcn = (((n & 0x3F) * 256) | (msg[srcn] & 0xFF));
			
			if (srcn < 0 || srcn >= eom) { /* Out of range */
				errno = 'EMSGSIZE';
				return (-1);
			}
			
			checked += 2;
			/* check for loops in compressed name */
			if (checked >= eom) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			break;
			
		default:
			errno = 'EMSGSIZE';
			return (-1); // flag error
		}
	}
	dst[dstn] = 0;
	if (dstlenp != null)
		dstlenp.set(dstn);
	if (llen < 0)
		llen = srcn - offset;
	return (llen);
}
exports.ns_name_unpack2 = ns_name_unpack2;

function ns_name_pack (src, srcn, dst, dstn, dstsiz, dnptrs, lastdnptr) {
	var dstp;
	var cpp, lpp, eob, msgp;
	var srcp;
	var n, l, first = 1;

	srcp = srcn;
	dstp = dstn;
	eob = dstp + dstsiz;
	lpp = cpp = null;
	var ndnptr = 0;
	if (dnptrs != null) {
		msg = dst;
		//if ((msg = dnptrs[ndnptr++]) != null) {
		for (cpp = 0; dnptrs[cpp] != null; cpp++);
		lpp = cpp; // end of list to search
		//}
	} else
		msg = null;
	
	// make sure the domain we are about to add is legal
	l = 0;
	do {
		var l0;
		
		n = src[srcp];
		if ((n & ns_cmprsflgs) == ns_cmprsflgs) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		if ((l0 = labellen(src, srcp)) < 0) {
			errno = 'EINVAL';
			return (-1);
		}
		l += l0 + 1;
		if (l > ns_maxcdname) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		srcp += l0 + 1;
	} while (n != 0);
	
	// from here on we need to reset compression pointer array on error
	srcp = 0;
	var cleanup = false; // instead of goto
	do {
		// look to see if we can use pointers
		n = src[srcp];
		if (n != 0 && msg != null) {
			l = dn_find (src, srcp, msg, dnptrs, ndnptr, lpp);
			if (l >= 0) {
				if (dstp + 1 >= eob) {
					cleanup = true;
					break;
				}
				dst[dstp++] = (l >> 8) | ns_cmprsflgs;
				dst[dstp++] = l & 0xff;
				return (dstp - dstn);
			}
			// Not found, save it.
			if (lastdnptr != null && cpp < lastdnptr - 1 &&
			    (dstp) < 0x4000 && first) {
				dnptrs[cpp++] = dstp;
				dnptrs[cpp++] = null;
				first = 0;
			}
		}
		// copy label to buffer
		if ((n & ns_cmprsflgs) == ns_cmprsflgs) {
			// should not happen
			cleanup = true;
			break;
		}
		n = labellen (src, srcp);
		if (dstp + 1 + n >= eob) {
			cleanup = true;
			break;
		}
		src.copy (dst, dstp, srcp, srcp + (n + 1));
		srcp += n + 1;
		dstp += n + 1;
		
	} while (n != 0);
	
	if (dstp > eob ||
// cleanup:
	    cleanup) {
		if (msg != null) {
			dnptrs[lpp] = null;
		}
		errno = 'EMSGSIZE';
		return (-1);
	}
	return (dstp - dstn);
}
exports.ns_name_pack = ns_name_pack;

function ns_name_skip (b, ptrptr, eom) {
	var cp;
	var n;
	var l;
	cp = ptrptr.get ();
	while (cp < eom && (n = b[cp++]) != 0) {
		switch (n & ns_cmprsflgs) {
		case 0: // normal case, n == len
			cp += n;
			continue;
		case ns_type_elt: // edns0 extended label
			if ((l = labellen (b, cp - 1)) < 0) {
				errno = 'EMSGSIZE';
				return (-1);
			}
			cp += l;
			continue;
		case ns_cmprsflgs: // indirection
			cp++;
			break;
		default: // illegal type
			errno = 'EMSGSIZE';
			return (-1);
		}
		break;
	}
	if (cp > eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	ptrptr.set (cp);
	return (0);
}
exports.ns_name_skip = ns_name_skip;

function ns_name_length (b, nname, namesiz)
{
	var orig = nname;
	var n;

	while (namesiz-- > 0 && (n = b[nname++]) != 0) {
		if ((n & ns_cmprsflgs) != 0) {
			return (-1);
		}
		if (n > namesiz) {
			return (-1);
		}
		nname += n;
		namesiz -= n;
	}
	return (nname - orig);
}
exports.ns_name_length = ns_name_length;

function strncasecmp (buf1, s1, buf2, s2, n)
{
	for (var i = 0; i < n; i++) {
		if ((buf1[s1+i] | 0x20) != (buf2[s2+i] | 0x20)) {
			return (-1);
		}
	}
	return (0);
}

function ns_name_eq (bufa, a, as, bufb, b, bs)
{
	var ae = a + as, be = b + bs;
	var ac, cb;
	while (ac = bufa[a], bc = bufb[b], ac != 0 && bc != 0) {
		if ((ac & ns_cmprsflgs) != 0 || (bc & ns_cmprsflgs) != 0) {
			errno = 'EISDIR';
			return (-1);
		}
		if (a + ac >= ae || b + bc >= be) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		if (ac != bc || strncasecmp (bufa, ++a,
					     bufb, ++b, ac) != 0) {
			return (0);
		}
		a += ac, b += bc;
	}
	return (ac == 0 && bc == 0);
}
exports.ns_name_eq = ns_name_eq;

function ns_name_owned (bufa, mapa, an, bufb, mapb, bn)
{
	var a, b;
	if (an < bn)
		return (0);
	a = 0, b = 0;
	while (bn > 0) {
		if (mapa[a].len != mapa[b].len ||
		    strncasecmp (bufa, mapa[a].base,
				 bufb, mapb[b].base, mapa[a].len)) {
			return (0);
		}
		a++, an--;
		b++, bn--;
	}

	return (1);
}
exports.ns_name_owned = ns_name_owned;

function ns_name_map (b, nname, namelen, map, mapsize)
{
	var n;
	var l;

	n = b[nname++];
	namelen--;

	/* root zone? */
	if (n == 0) {
		/* extra data follows name? */
		if (namelen > 0) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		return (0);
	}
	/* compression pointer? */
	if ((n & ns_cmprsflgs) != 0) {
		errno = 'EISDIR';
		return (-1);
	}

	/* label too long? */
	if (n > namelen) {
		errno = 'EMSGSIZE';
		return (-1);
	}

	/* recurse to get rest of name done first */
	l = ns_name_map (b, nname + n, namelen - n, map, mapsize);
	if (l < 0) {
		return (-1);
	}

	/* too many labels? */
	if (l >= mapsize)  {
		errno = 'ENAMETOOLONG';
		return (-1);
	}

	map.buf = b;
	map[l] = new Object ();
	/* we're on our way back up-stack, store current map data */
	map[l].base = nname;
	map[l].len = n;
	return (l + 1);
}
exports.ns_name_map = ns_name_map;

function ns_name_labels (b, nname, namesiz)
/* count the number of labels in a domain name. root counts.
   for ns_name_map () */
{
	var ret = 0;
	var n;

	while (namesiz-- > 0 && (n = b[nname++]) != 0) {
		if ((n & ns_cmprsflgs) != 0) {
			errno = 'EISDIR';
			return (-1);
		}
		if (n > namesiz) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		nname += n;
		namesiz -= n;
		ret++;
	}
	return (ret + 1);
}
exports.ns_name_labels = ns_name_labels;

function special (ch) {
	switch(ch) {
	case 0x22: /* '"' */
	case 0x2E: /* '.' */
	case 0x3B: /* ';' */
	case 0x5C: /* '\\' */
	case 0x28: /* '(' */
	case 0x29: /* ')' */
		/* special modifiers in the zone file */
	case 0x40: /* '@' */
	case 0x24: /* '$' */
		return (1);
	default:
		return (0);
	}
}

function printable (ch)
{
	return (ch > 0x20 && ch < 0x7F);
}

function mklower (ch)
{
	if (ch >= 0x41 && ch <= 0x5A)
		return (ch + 0x20);
	return (ch);
}

function dn_find (src, domain, msg, dnptrs, ndnptr, lastdnptr)
{
	var dn, cp, sp;
	var cpp;
	var n;
	
	var next = false; // instead of goto
	for (cpp = ndnptr; cpp < lastdnptr; cpp++) {
		sp = dnptrs[cpp];
		//
		// terminate search on:
		// root label
		// compression pointer
		// unusable offset
		//
		while (msg[sp] != 0 && (msg[sp] & ns_cmprsflgs) == 0 &&
		       (sp) < 0x4000) {
			dn = domain;
			cp = sp;
			while ((n = msg[cp++]) != 0) {
				//
				// check for indirection
				//
				switch (n & ns_cmprsflgs) {
				case 0: // normal case, n == len
					n = labellen (msg, cp - 1); // XXX
					if (n != src[dn++]) {
						next = true;
						break;
					}
					for (null; n > 0; n--) {
						if (mklower (src[dn++]) !=
						    mklower (msg[cp++])) {
							next = true;
							break;
						}
					}
					if (next) {
						break;
					}
					// Is next root for both ?
					if (src[dn] == 0 && msg[cp] == 0) {
						return (sp);
					}
					if (src[dn])  {
						continue;
					}
					next = true;
					break;
				case ns_cmprsflgs: // indirection
					cp = (((n & 0x3f) * 256) | msg[cp]);
					break;
					
				default: // illegal type
					errno = 'EMSGSIZE';
					return (-1);
				}
				if (next) {
					break;
				}
			}
			sp += msg[sp] + 1;
			if (next) {
				next = false;
			}
		}
	}
	errno = 'ENOENT';
	return (-1);
}
exports.dn_find = dn_find;

function decode_bitstring (b, cpp, d, dn, eom)
{
	var cp = cpp.get ();
	var beg = dn, tc;
	var b, blen, plen, i;
	
	if ((blen = (b[cp] & 0xff)) == 0)
		blen = 256;
	plen = (blen + 3) / 4;
	plen += "\\[x/]".length + (blen > 99 ? 3 : (blen > 9) ? 2 : 1);
	if (dn + plen >= eom)
		return (-1);
	
	cp++;
	i = d.write ("\\[x", dn);
	if (i != 3)
		return (-1);
	dn += i;
	for (b = blen; b > 7; b -= 8, cp++) {
		if (dn + 2 >= eom)
			return (-1);
	}
}
exports.decode_bitstring = decode_bitstring;

function encode_bitstring (src, bp, end, labelp, dst, dstp, eom)
{
	var afterslash = 0;
	var cp = bp.get ();
	var tp;
	var c;
	var beg_blen;
	var end_blen = null;
	var value = 0, count = 0, tbcount = 0, blen = 0;
	
	beg_blen = end_blen = null;
	
	// a bitstring must contain at least two bytes
	if (end - cp < 2)
		return errno.EINVAL;
	
	// currently, only hex strings are supported
	if (src[cp++] != 120) // 'x'
		return errno.EINVAL;
	if (!isxdigit ((src[cp]) & 0xff)) // reject '\[x/BLEN]'
		return errno.EINVAL;
	
	var done = false;
	for (tp = dstp.get () + 1; cp < end && tp < eom; cp++) {
		switch (c = src[cp++]) {
		case 93: // ']'
			if (afterslash) {
				if (beg_blen == null)
					return errno.EINVAL;
				blen = strtol (src, beg_blen, 10);
				// todo:
				// if ( char after string == ']' )
				// return errno.EINVAL;
			}
			if (count)
				dst[tp++] = ((value << 4) & 0xff);
			cp++; // skip ']'
			done = true;
			break;
		case 47: // '/'
			afterslash = 1;
			break;
		default:
			if (afterslash) {
				if (!isxdigit (c&0xff))
					return errno.EINVAL;
				if (beg_blen == null) {
					
					if (c == 48) { // '0'
						// blen never begins with 0
						return errno.EINVAL;
					}
					beg_blen = cp;
				}
			} else {
				if (!isxdigit (c&0xff))
					return errno.EINVAL;
				value <<= 4;
				value += digitvalue[c];
				count += 4;
				tbcount += 4;
				if (tbcount > 256)
					return errno.EINVAL;
				if (count == 8) {
					dst[tp++] = value;
					count = 0;
				}
			}
			break;
		}
		if (done) {
			break;
		}
	}
	// done:
	if (cp >= end || tp >= eom)
		return errno.EMSGSIZE;
	// bit length validation:
	// If a <length> is present, the number of digits in the <bit-data>
	// MUST be just sufficient to contain the number of bits specified
	// by the <length>. If there are insufficient bits in a final
	// hexadecimal or octal digit, they MUST be zero.
	// RFC2673, Section 3.2
	if (blen && (blen > 0)) {
		var traillen;
		
		if (((blen + 3) & ~3) != tbcount)
			return errno.EINVAL;
		traillen = tbcount - blen; // between 0 and 3
		if (((value << (8 - traillen)) & 0xFF) != 0)
			return errno.EINVAL;
	}
	else
		blen = tbcount;
	if (blen == 256)
		blen = 0;
	
	// encode the type and the significant bit fields
	src[labelp.get ()] = dns_labeltype_bitstring;
	dst[dstp.get ()] = blen;
	
	bp.set (cp);
	dstp.set (tp);
	
	return (0);
}
exports.encode_bitstring = encode_bitstring;

function isxdigit (ch) {
	return ((ch >= 48 && ch <= 57)
		|| (ch >= 97 && ch <= 102)
		|| (ch >= 65 && ch <= 70));
}

function isspace (ch) {
	return (ch == 32 || ch == 12 || ch == 10 || ch == 13 || ch == 9 || ch == 12);
}

function strtol (b, off, end, base) {
	// todo: port from C
	return parseInt (b.toString (off, end), base);
}

function labellen (b, off) {
	var bitlen;
	var l = b[off];
	
	if ((l & ns_cmprsflgs) == ns_cmprsflgs) {
		return (-1);
	}
	if ((l & ns_cmprsflgs) == ns_type_elt) {
		if (l == dns_labeltype_bitstring) {
			bitlen = b[off + 1];
			if (bitlen == 0) {
				bitlen = 256;
			}
			return (1 + (bitlen + 7) / 8);
		}
	}
	return (l);
}
exports.labellen = labellen;

function dn_skipname (buf, ptr, eom)
{
	var saveptr = ptr;
	var ptrptr = new Ptr (ptr);

	if (ns_name_skip (buf, ptrptr, eom) == -1) {
		return (-1);
	}
	
	return (ptrptr.get () - saveptr);
}
exports.dn_skipname = dn_skipname;

function ns_name_uncompress (msg, offset, len, dst, dstsiz)
{
	var n;

	if ((n = ns_name_unpack (msg, offset, len, _dname, _dname.length)) == -1) return (-1);
	if (ns_name_ntop (_dname, dst, dstsiz) == -1) return (-1);
	return (n);
}
exports.ns_name_uncompress = ns_name_uncompress;

function dn_expand (msg, offset, len, dst, dstsiz)
{
	var n = ns_name_uncompress (msg, offset, len, dst, dstsiz);

	if (n > 0 && dst[0] == '.') dst[0] = 0;
	return (n);
}
exports.dn_expand = dn_expand;

function ns_skiprr (buf, ptr, eom, section, count)
{
	var optr = ptr;
	for (var i = 0; i < count; i++) {
		var b, rdlength;
		b = dn_skipname (buf, ptr, eom);
		if (b < 0) {
			return (-1);
		}
		ptr += b + ns_int16sz + ns_int16sz;
		if (section != ns_s.qd) {
			if (ptr + ns_int32sz + ns_int16sz > eom) return (-1);
			ptr += ns_int32sz;
			rdlength = buf[ptr] * 256 + buf[ptr+1];
			ptr += ns_int16sz;
			ptr += rdlength;
		}
	}
	if (ptr > eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	return (ptr - optr);
}
exports.ns_skiprr = ns_skiprr;

function ns_msg ()
{
	this._buf = 0;
	this._msg = 0;
	this._eom = 0;
	this._id = 0, this._flags = 0, this._counts = new Array (ns_s.max);
	this._sections = new Array (ns_s.max);
	this._sect = 0;
	this._rrnum = 0;
	this._msg_ptr = 0;
}
exports.ns_msg = ns_msg;

ns_msg.prototype.getId = function ()
{
	return this._id;
};

ns_msg.prototype.getBase = function ()
{
	return this._msg;
};

ns_msg.prototype.getSize = function ()
{
	return this._eom;
};

ns_msg.prototype.getCount = function (section)
{
	return this._counts[section];
};

ns_msg.prototype.getFlag = function (flag)
{
	if (flag > 0 && flag < ns_flagdata.length)
		return ((this._flags & ns_flagdata[flag].mask) >> ns_flagdata[flag].shift);
	return (0);
};

function ns_rr ()
{
	this.name = '';
	this.type = 0;
	this.rr_class = 0;
	this.ttl = 0;
	this.rdlength = 0;
	this.rdata = null;
}
exports.ns_rr = ns_rr;

function ns_rr2 ()
{
	this.nname = new Buffer (ns_maxdname);
	this.nnamel = 0;
	this.type = 0;
	this.rr_class = 0;
	this.ttl = 0;
	this.rdlength = 0;
	this.rdata = null;
}
exports.ns_rr2 = ns_rr2;

function ns_initparse (buf, buflen, handle)
{
	var msg = 0, eom = buflen;
	var i;

	handle._buf = buf;
	handle._msg = 0;
	handle._eom = eom;

	if (msg + ns_int16sz > eom) return (-1);
	handle._id = buf[msg] * 256 + buf[msg+1];
	msg += ns_int16sz;

	if (msg + ns_int16sz > eom) return (-1);
	handle._flags = buf[msg] * 256 + buf[msg+1];
	msg += ns_int16sz;

	for (i = 0; i < ns_s.max; i++) {
		if (msg + ns_int16sz > eom) return (-1);
		handle._counts[i] = buf[msg] * 256 + buf[msg+1];
		msg += ns_int16sz;
	}

	for (i = 0; i < ns_s.max; i++) {
		if (handle._counts[i] == 0) {
			handle._sections[i] = null;
		} else {
			var b = ns_skiprr (buf, msg, eom, i, handle._counts[i]);
			if (b < 0) {
				return (-1);
			}
			handle._sections[i] = msg;
			msg += b;
		}
	}

	if (msg != eom) return (-1);
	setsection (handle, ns_s.max);
	return (0);
}
exports.ns_initparse = ns_initparse;

function ns_parserr2 (handle, section, rrnum, rr)
{
	var b;
	var tmp;

	tmp = section;
	if (tmp < 0 || section >= ns_s.max) {
		errno = 'ENODEV';
		return (-1);
	}
	if (section != handle._sect) setsection (handle, section);

	if (rrnum == -1) rrnum = handle._rrnum;
	if (rrnum < 0 || rrnum >= handle._counts[section]) {
		errno = 'ENODEV';
		return (-1);
	}
	if (rrnum < handle._rrnum) setsection (handle, section);
	if (rrnum > handle._rrnum) {
		b = ns_skiprr (handle._buf, handle._msg_ptr, handle._eom, section, rrnum - handle._rrnum);
		if (b < 0) return (-1);
		handle._msg_ptr += b;
		handle._rrnum = rrnum;
	}
	// do the parse
	var nnamelp = new Ptr ();
	b = ns_name_unpack2 (handle._buf, handle._msg_ptr, handle._eom, rr.nname, rr.nname.length, nnamelp);
	if (b < 0) return (-1);
	rr.nnamel = nnamelp.get ();
	handle._msg_ptr += b;
	if (handle._msg_ptr + ns_int16sz + ns_int16sz > handle._eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	rr.type = handle._buf[handle._msg_ptr] * 256 + handle._buf[handle._msg_ptr+1];
	handle._msg_ptr += ns_int16sz;
	rr.rr_class = handle._buf[handle._msg_ptr] * 256 + handle._buf[handle._msg_ptr+1];
	handle._msg_ptr += ns_int16sz;
	if (section === ns_s.qd) {
		rr.ttl = 0;
		rr.rdlength = 0;
		rr.rdata = null;
	} else {
		if (handle._msg_ptr + ns_int32sz + ns_int16sz > handle._eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		rr.ttl = (handle._buf[handle._msg_ptr] * 16777216 +
			  handle._buf[handle._msg_ptr+1] * 65536 +
			  handle._buf[handle._msg_ptr+2] * 256 +
			  handle._buf[handle._msg_ptr+3]);
		handle._msg_ptr += ns_int32sz;
		rr.rdlength = handle._buf[handle._msg_ptr] * 256 + handle._buf[handle._msg_ptr+1];
		handle._msg_ptr += ns_int16sz;
		if (handle._msg_ptr + rr.rdlength > handle._eom) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		rr.rdata = handle._msg_ptr;
		handle._msg_ptr += rr.rdlength;
	}
	if (++handle._rrnum > handle._counts[section]) setsection (handle, setsection + 1);

	// all done
	return (0);
}
exports.ns_parserr2 = ns_parserr2;

function setsection (msg, sect) 
{
	msg._sect = sect;
	if (sect == ns_s.max) {
		msg._rrnum = -1;
		msg._msg_ptr = null;
	} else {
		msg._rrnum = 0;
		msg._msg_ptr = msg._sections[sect];
	}
}
exports.setsection = setsection;

function ns_newmsg ()
{
	this.msg = new ns_msg ();
	this.dnptrs = new Array (25);
	this.lastdnptr = this.dnptrs.length;
}
exports.ns_newmsg = ns_newmsg;

ns_newmsg.prototype.setId = function (id)
{
	this.msg._id = id;
};

ns_newmsg.prototype.setFlag = function (flag, value)
{
	this.msg._flags &= (~ns_flagdata[flag].mask);
	this.msg._flags |= (value << ns_flagdata[flag].shift);
};

function ns_newmsg_init (buf, bufsiz, handle)
{
	var msg = handle.msg;

        ns_msg.apply(msg); // reset msg better.

	msg._buf = buf;
	msg._msg = 0;
	msg._eom = bufsiz;
	msg._sect = ns_s.qd;
	msg._rrnum = 0;
	msg._msg_ptr = 0 + ns_hfixedsz;

	handle.dnptrs[0] = 0;
	handle.dnptrs[1] = null;
	handle.lastdnptr = handle.dnptrs.length;

	return (0);
}
exports.ns_newmsg_init = ns_newmsg_init;

function ns_newmsg_q (handle, qname, qtype, qclass)
{
	var msg = handle.msg;
	var t;
	var n;

	if (msg._sect != ns_s.qd) {
		errno = 'ENODEV';
		return (-1);
	}

	t = msg._msg_ptr;
	if (msg._rrnum == 0) {
		msg._sections[ns_s.qd] = t;
	}
	n = ns_name_pack (qname, 0, msg._buf, t, msg._eom - t, handle.dnptrs, handle.lastdnptr);
	if (n < 0) return (-1);
	t += n;
	if (t + ns_qfixedsz >= msg._eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	msg._buf[t++] = (qtype >> 8);
	msg._buf[t++] = (qtype >> 0);
	msg._buf[t++] = (qclass >> 8);
	msg._buf[t++] = (qclass >> 0);
	msg._msg_ptr = t;
	msg._counts[ns_s.qd] = ++msg._rrnum;
	return (0);
}
exports.ns_newmsg_q = ns_newmsg_q;

function ns_newmsg_rr (handle, sect, name, type, rr_class, ttl, rdlen, rdata)
{
	var msg = handle.msg;
	var t;
	var n;

	if (!Buffer.isBuffer (rdata)) {
		throw new Error ('error');
	}

	if (sect < msg._sect) {
		errno = 'ENODEV';
		return (-1);
	}
	t = msg._msg_ptr;
	if (sect > msg._sect) {
		msg._sect = sect;
		msg._sections[sect] = t;
		msg._rrnum = 0;
	}
	n = ns_name_pack (name, 0, msg._buf, t, msg._eom - t, handle.dnptrs, handle.lastdnptr);
	if (n < 0) return (-1);
	t += n;
	if (t + ns_rrfixedsz + rdlen > msg._eom) {
		errno = 'EMSGSIZE';
		return (-1);
	}
	msg._buf[t++] = (type >> 8);
	msg._buf[t++] = (type >> 0);
	msg._buf[t++] = (rr_class >> 8);
	msg._buf[t++] = (rr_class >> 0);
	msg._buf[t++] = (ttl >> 24);
	msg._buf[t++] = (ttl >> 16);
	msg._buf[t++] = (ttl >> 8);
	msg._buf[t++] = (ttl >> 0);
	msg._msg_ptr = t;
	if (rdcpy (handle, type, rdata, rdlen) < 0) return (-1);
	msg._counts[sect] = ++msg._rrnum;
	return (0);
}
exports.ns_newmsg_rr = ns_newmsg_rr;

function ns_newmsg_done (handle)
{
	var msg = handle.msg;
	var sect;
	var t;

	t = 0;
	msg._buf[t++] = (msg._id >> 8);
	msg._buf[t++] = (msg._id >> 0);
	msg._buf[t++] = (msg._flags >> 8);
	msg._buf[t++] = (msg._flags >> 0);
	for (var sect = 0; sect < ns_s.max; sect++) {
		msg._buf[t++] = (msg._counts[sect] >> 8);
		msg._buf[t++] = (msg._counts[sect] >> 0);
	}
	msg._eom = msg._msg_ptr;
	msg._sect = ns_s.max;
	msg._rrnum = -1;
	msg._msg_ptr = null;

	return (msg._eom);
}
exports.ns_newmsg_done = ns_newmsg_done;

function rdcpy (handle, type, rdata, rdlen)
{
	var msg = handle.msg;
	
	var p = msg._msg_ptr;
	var t = p + ns_int16sz;
	var s = t;
	var n;

	var nrdata = 0;

	switch (type) {
	case ns_t.soa:
		n = ns_name_pack (rdata, nrdata, msg._buf, t, msg._eom - t, handle.dnptrs, handle.lastdnptr);
		if (n < 0) return (-1);
		t += n;

		_ptr.set (nrdata);
		if (ns_name_skip (rdata, _ptr, msg._eom) < 0) return (-1);
		nrdata = _ptr.get ();

		n = ns_name_pack (rdata, nrdata, msg._buf, t, msg._eom - t, handle.dnptrs, handle.lastdnptr);
		if (n < 0) return (-1);
		t += n;

		_ptr.set (nrdata);
		if (ns_name_skip (rdata, _ptr, msg._eom) < 0) return (-1);
		nrdata = _ptr.get ();

		if ((msg._eom - t) < ns_int32sz * 5) {
			errno = 'EMSGSIZE';
			return (-1);
		}
		rdata.copy (msg._buf, t, nrdata, nrdata + ns_int32sz * 5);
		t += (ns_int32sz * 5);
		/* 
		rdata.copy (msg._buf, t, nrdata, rdlen);
		t += rdlen;
		*/
		break;
	case ns_t.ptr:
	case ns_t.cname:
	case ns_t.ns:
		n = ns_name_pack (rdata, nrdata, msg._buf, t, msg._eom - t, handle.dnptrs, handle.lastdnptr);
		if (n < 0) return (-1);
		t += n;
		break;
	default:
		rdata.copy (msg._buf, t, nrdata, rdlen);
		t += rdlen;
		break;
	}

	msg._buf[p++] = ((t - s) >> 8);
	msg._buf[p++] = ((t - s) >> 0);
	msg._msg_ptr = t;
	return (0);
}

function RDataParser ()
{
	this.msg = null;
	this.eom = 0;
	this.rdata = 0;
	this.rdlen = 0;
	this.nrdata = 0;

	this.active = false;
}
RDataParser.prototype.initialize = function (msg, eom, rdata, rdlen, nrdata)
{
	this.msg = msg;
	this.eom = eom;
	this.rdata = rdata;
	this.rdlen = rdlen;
	this.nrdata = nrdata;

	this.active = true;
};
RDataParser.prototype.finalize = function () 
{
	this.active = false;

	return (this.rdlen == 0);
};
RDataParser.prototype.consume = function (n)
{
	if (this.active) {
		if (this.rdlen < n) {
			this.active = false;
		}
		else {
			this.rdata += n;
			this.rdlen -= n;
		}
	}
	return this.active;
};
RDataParser.prototype.IPv4 = function ()
{
	if (this.consume (4)) {
		var item = [this.msg[this.rdata-4],
			    this.msg[this.rdata-3],
			    this.msg[this.rdata-2],
			    this.msg[this.rdata-1]].join ('.');
		this.nrdata.push (item);
	}
};
RDataParser.prototype.IPv6 = function ()
{
	if (this.consume (16)) {
		var item = [(hexvalue[this.msg[this.rdata-16]]+
			     hexvalue[this.msg[this.rdata-15]]),
			    (hexvalue[this.msg[this.rdata-14]]+
			     hexvalue[this.msg[this.rdata-13]]),
			    (hexvalue[this.msg[this.rdata-12]]+
			     hexvalue[this.msg[this.rdata-11]]),
			    (hexvalue[this.msg[this.rdata-10]]+
			     hexvalue[this.msg[this.rdata-9]]),
			    (hexvalue[this.msg[this.rdata-8]]+
			     hexvalue[this.msg[this.rdata-7]]),
			    (hexvalue[this.msg[this.rdata-6]]+
			     hexvalue[this.msg[this.rdata-5]]),
			    (hexvalue[this.msg[this.rdata-4]]+
			     hexvalue[this.msg[this.rdata-3]]),
			    (hexvalue[this.msg[this.rdata-2]]+
			     hexvalue[this.msg[this.rdata-1]])].join (":");
		
		this.nrdata.push (item);
	}
};
RDataParser.prototype.name = function ()
{
	var len, n;
	if (this.active) {
		if ((len = ns_name_unpack (this.msg, this.rdata, this.rdlen, _dname, _dname.length)) == -1) {
			this.active = false;
			return;
		}
		if ((n = ns_name_ntop (_dname, _string, _string.length)) == -1) {
			this.active = false;
			return;
		}
		
		var item = _string.toString ('ascii', 0, n);
		
		if (this.consume (len)) {
			this.nrdata.push (item);
		}
	}
};
RDataParser.prototype.UInt32 = function ()
{
	if (this.consume (4)) {
		var item = (this.msg[this.rdata-4] * 16777216 +
			    this.msg[this.rdata-3] * 65536 +
			    this.msg[this.rdata-2] * 256 +
			    this.msg[this.rdata-1]);
		this.nrdata.push (item);
	}
};
RDataParser.prototype.UInt16 = function ()
{
	if (this.consume (2)) {
		var item = (this.msg[this.rdata-2] * 256 +
			    this.msg[this.rdata-1]);
		this.nrdata.push (item);
	}
};
RDataParser.prototype.UInt8 = function ()
{
	if (this.consume (1)) {
		var item = (this.msg[this.rdata-1]);
		this.nrdata.push (item);
	}
};
RDataParser.prototype.string = function (n)
{
	if (this.consume (n)) {
		var item = this.msg.toString ('ascii', this.rdata - n, this.rdata);
		this.nrdata.push (item);
	}
};
RDataParser.prototype.txt = function ()
{
	if (this.active) {
		var item = "";
		if (this.rdlen > 0 && this.consume (1)) {
			var n = this.msg[this.rdata - 1];
			if (this.consume (n)) {
				var tmp = this.msg.toString ('ascii', this.rdata - n, this.rdata);
				item += tmp;
			}
			else {
				this.active = false;
				return;
			}
		}
		this.nrdata.push (item);
	}
};
RDataParser.prototype.rest = function ()
{
	if (this.consume (this.rdlen)) {
		var item = this.msg.slice (this.rdata - this.rdlen, this.rdata);
		this.nrdata.push (item);
	}
};

// only used in ns_rdata_unpack, no chance of clobbering
var _rdataParser = new RDataParser ();
function ns_rdata_unpack (msg, eom, type, rdata, rdlen, nrdata)
{
	_rdataParser.initialize (msg, eom, rdata, rdlen, nrdata);

	switch (type) {
	case ns_t.a:
		_rdataParser.IPv4 ();
		break;
	case ns_t.aaaa:
		_rdataParser.IPv6 ();
		break;
	case ns_t.cname:
	case ns_t.mb:
	case ns_t.mg:
	case ns_t.mr:
	case ns_t.ns:
	case ns_t.ptr:
	case ns_t.dname:
		_rdataParser.name ();
		break;
	case ns_t.soa:
		_rdataParser.name ();
		_rdataParser.name ();
		_rdataParser.UInt32 ();
		_rdataParser.UInt32 ();
		_rdataParser.UInt32 ();
		_rdataParser.UInt32 ();
		_rdataParser.UInt32 ();
		break;
	case ns_t.mx:
	case ns_t.afsdb:
	case ns_t.rt:
		_rdataParser.UInt16 ();
		_rdataParser.name ();
		break;
	case ns_t.px:
		_rdataParser.UInt16 ();
		_rdataParser.name ();
		_rdataParser.name ();
		break;
	case ns_t.srv:
		_rdataParser.UInt16 ();
		_rdataParser.UInt16 ();
		_rdataParser.UInt16 ();
		_rdataParser.name ();
		break;
	case ns_t.minfo:
	case ns_t.rp:
		_rdataParser.name ();
		_rdataParser.name ();
		break;
	case ns_t.txt:
		_rdataParser.txt ();
		break;
	default:
		_rdataParser.rest ();
	}

	if (_rdataParser.finalize () == false) {
		errno = 'EMSGSIZE';
		return (-1);
	}

	return (0);
}
exports.ns_rdata_unpack = ns_rdata_unpack;

function RDataWriter ()
{
	this.srdata = null;
	this.buf = null;
	this.ordata = 0;
	this.rdata = 0;
	this.rdsiz = 0;

	this.nconsumed = 0;
	this.nitem = 0;

	this.active = false;
}
RDataWriter.prototype.initialize = function (srdata, buf, rdata, rdsiz)
{
	this.srdata = srdata;
	this.buf = buf;
	this.ordata = rdata;
	this.rdata = rdata;
	this.rdsiz = rdsiz;

	this.nconsumed = 0;
	this.nitem = 0;

	this.active = true;
};
RDataWriter.prototype.consume = function (n)
{
	if (this.active) {
		if (this.rdsiz < n) {
			this.active = false;
		}
		else {
			this.rdata += n;
			this.rdsiz -= n;

			this.nconsumed += n;
		}
	}
	return this.active;
};
RDataWriter.prototype.next = function ()
{
	var item;
	if (this.nitem < this.srdata.length) {
		item = this.srdata[this.nitem++];
	}
	return item;
};
RDataWriter.prototype.IPv4 = function ()
{
	var item = this.next ();
	if (this.consume (4)) {
		if (!Buffer.isBuffer (item) && !Array.isArray (item)) {
			if (typeof item === 'string') {
				item = item.split ('.');
			}
			else {
				item = item.toString ().split ('.');
			}
		}
		if (item.length < 4) {
			this.active = false;
			return;
		}
		this.buf[this.rdata-4] = item[0];
		this.buf[this.rdata-3] = item[1];
		this.buf[this.rdata-2] = item[2];
		this.buf[this.rdata-1] = item[3];
	}
};
RDataWriter.prototype.IPv6 = function ()
{
	var item = this.next ();
	if (this.consume (16)) {
		if (Buffer.isBuffer (item) || Array.isArray (item)) {
			if (item.length < 16) {
				this.active = false;
				return;
			}

			this.buf[this.rdata-16] = item[0];
			this.buf[this.rdata-15] = item[1];
			this.buf[this.rdata-14] = item[2];
			this.buf[this.rdata-13] = item[3];
			this.buf[this.rdata-12] = item[4];
			this.buf[this.rdata-11] = item[5];
			this.buf[this.rdata-10] = item[6];
			this.buf[this.rdata-9] = item[7];
			this.buf[this.rdata-8] = item[8];
			this.buf[this.rdata-7] = item[9];
			this.buf[this.rdata-6] = item[10];
			this.buf[this.rdata-5] = item[11];
			this.buf[this.rdata-3] = item[12];
			this.buf[this.rdata-2] = item[13];
			this.buf[this.rdata-1] = item[14];
			this.buf[this.rdata-1] = item[15];
		}
		else {
			var tmp = item.toString ().split (':');
			if (tmp.length < 8) {
				this.active = false;
				return;
			}
			for (var i = 0; i < 8; i++) {
				var n = parseInt (tmp[i], 16);
				this.buf[this.rdata-16 + i*2] = (n >> 8);
				this.buf[this.rdata-15 + i*2] = (n >> 0);
			}
		}
	}
};
RDataWriter.prototype.name = function ()
{
	var item = this.next ();
	var len, n;
	if (this.active) {
		if (Buffer.isBuffer (item)) {
			len = item.length;
			if (len + 1 > _string.length) {
				this.active = false;
				return;
			}
			item.copy (_string, 0, 0, len);
			_string[len] = 0;
			if (ns_name_pton2 (_string, _dname, _dname.length, _ptr) == -1) {
				this.active = false;
				return;
			}
			n = _ptr.get ();
			if (this.consume (n)) {
				_dname.copy (this.buf, this.rdata - n, 0, n);
			}
		}
		if (typeof (item) === 'string') {
			if ((len = _string.write (item, 0, 'ascii')) == _string.length) {
				this.active = false;
				return;
			}
			_string[len] = 0;
			if (ns_name_pton2 (_string, _dname, _dname.length, _ptr) == -1) {
				this.active = false;
				return;
			}
			n = _ptr.get ();
			if (this.consume (n)) {
				_dname.copy (this.buf, this.rdata - n, 0, n);
			}
		}
		else {
			this.active = false;
			return;
		}
	}
};
RDataWriter.prototype.UInt32 = function ()
{
	var item = this.next ();
	if (this.consume (4)) {
		if (Buffer.isBuffer (item) || Array.isArray (item)) {
			if (item.length < 4) {
				this.active = false;
				return;
			}
			this.buf[this.rdata-4] = item[0];
			this.buf[this.rdata-3] = item[1];
			this.buf[this.rdata-2] = item[2];
			this.buf[this.rdata-1] = item[3];
		}
		else {
			if (typeof item !== 'number') {
				item = parseInt (item);
			}
			this.buf[this.rdata-4] = (item >> 24);
			this.buf[this.rdata-3] = (item >> 16);
			this.buf[this.rdata-2] = (item >> 8);
			this.buf[this.rdata-1] = (item >> 0);
		}
	}
};
RDataWriter.prototype.UInt16 = function ()
{
	var item = this.next ();
	if (this.consume (2)) {
		if (Buffer.isBuffer (item) || Array.isArray (item)) {
			if (item.length < 2) {
				this.active = false;
				return;
			}
			this.buf[this.rdata-2] = item[0];
			this.buf[this.rdata-1] = item[1];
		}
		else {
			if (typeof item !== 'number') {
				item = parseInt (item);
			}
			this.buf[this.rdata-2] = (item >> 8);
			this.buf[this.rdata-1] = (item >> 0);
		}
	}
};
RDataWriter.prototype.UInt8 = function ()
{
	var item = this.next ();
	if (this.consume (1)) {
		if (Buffer.isBuffer (item) || Array.isArray (item)) {
			if (item.length < 1) {
				this.active = false;
				return;
			}
			this.buf[this.rdata-1] = item[0];
		}
		else {
			if (typeof item !== 'number') {
				item = parseInt (item);
			}
			this.buf[this.rdata-1] = (item);
		}
	}
};
RDataWriter.prototype.txt = function ()
{
	var item = this.next ();
	var n;
	if (this.active) {
		if (typeof (item) === 'string') {
			if ((n = _string.write (item, 0, 'ascii')) == _string.length) {
				this.active = false;
				return;
			}
			if (n > 0 && this.consume (1)) {
				this.buf[this.rdata - 1] = n;
				if (this.consume (n)) {
					_string.copy (this.buf, this.rdata - n, 0, n);
				}
				else {
					this.active = false;
					return;
				}
			}
		}
		else if (Buffer.isBuffer (item)) {
			n = item.length;
			if (n > 0 && this.consume (1)) {
				this.buf[this.rdata - 1] = n;
				if (this.consume (n)) {
					item.copy (this.buf, this.rdata - n, 0, n);
				}
				else {
					this.active = false;
					return;
				}
			}
		}
	}
};
RDataWriter.prototype.rest = function ()
{
	if (this.consume (this.rdsiz)) {
		
	}
};

// only used in ns_rdata_pack. safe from clobbering
var _rdataWriter = new RDataWriter ();
function ns_rdata_pack (type, srdata, buf, rdata, rdsiz)
{
	/* javascript */
	_rdataWriter.initialize (srdata, buf, rdata, rdsiz);

	switch (type) {
	case ns_t.a:
		_rdataWriter.IPv4 ();
		break;
	case ns_t.aaaa:
		_rdataWriter.IPv6 ();
		break;
	case ns_t.cname:
	case ns_t.mb:
	case ns_t.mg:
	case ns_t.mr:
	case ns_t.ns:
	case ns_t.ptr:
	case ns_t.dname:
		_rdataWriter.name ();
		break;
	case ns_t.soa:
		_rdataWriter.name ();
		_rdataWriter.name ();
		_rdataWriter.UInt32 ();
		_rdataWriter.UInt32 ();
		_rdataWriter.UInt32 ();
		_rdataWriter.UInt32 ();
		_rdataWriter.UInt32 ();
		break;
	case ns_t.mx:
	case ns_t.afsdb:
	case ns_t.rt:
		_rdataWriter.UInt16 ();
		_rdataWriter.name ();
		break;
	case ns_t.px:
		_rdataWriter.UInt16 ();
		_rdataWriter.name ();
		_rdataWriter.name ();
		break;
	case ns_t.srv:
		_rdataWriter.UInt16 ();
		_rdataWriter.UInt16 ();
		_rdataWriter.UInt16 ();
		_rdataWriter.name ();
		break;
	case ns_t.minfo:
	case ns_t.rp:
		_rdataWriter.name ();
		_rdataWriter.name ();
		break;
	case ns_t.txt:
		_rdataWriter.txt ();
		break;
	default:
		_rdataWriter.rest ();
	}

	if (_rdataWriter.active == false) {
		return (-1);
	}

	debug (util.inspect (buf.slice (rdata, _rdataWriter.nconsumed)));

	return (_rdataWriter.nconsumed);
}
exports.ns_rdata_pack = ns_rdata_pack;

function MessageHeader ()
{
	this.id = 0;
	this.qr = 0;
	this.opcode = 0;
	this.aa = 0;
	this.tc = 0;
	this.rd = 0;
	this.ra = 0;
	this.z = 0;
	this.ad = 0;
	this.cd = 0;
	this.rcode = 0;
	this.qdcount = 0;
	this.ancount = 0;
	this.nscount = 0;
	this.arcount = 0;
}
exports.MessageHeader = MessageHeader;

function MessageQuestion (name, type, class2)
{
	this.name = name;
	this.type = type;
	this.class2 = class2;
}
exports.MessageQuestion = MessageQuestion;

function MessageRR (name, type, class2, ttl)
{
	this.name = name;
	this.type = type;
	this.class2 = class2;
	this.ttl = ttl;

	if (arguments.length > 4) {
		this.rdata = arguments[4];
	} else {
		this.rdata = new Array ();
	}
}
exports.MessageRR = MessageRR;

function Message ()
{
	events.EventEmitter.call (this);

	this.header = new MessageHeader ();
	this.question = new Array ();
	this.answer = new Array ();
	this.authorative = new Array ();
	this.additional = new Array ();
}
sys.inherits (Message, events.EventEmitter);
exports.Message = Message;

Message.prototype.addQuestion = function (qname, qtype, qclass)
{
	var q;
	q = new MessageQuestion (qname, qtype, qclass);
	this.question.push (q);
	return q;
};
Message.prototype.addRR = function (sect, name, type, class2, ttl)
{
	var rr;
	if (sect == ns_s.qd) {
		rr = new MessageQuestion (name, type, class2);
	}
	else {
		rr = new MessageRR (name, type, class2, ttl, Array.prototype.slice.call (arguments, 5));
	}
	
	switch (sect) {
	case ns_s.qd:
		this.question.push (rr);
		this.header.qdcount++;
		break;
	case ns_s.an:
		this.answer.push (rr);
		this.header.ancount++;
		break;
	case ns_s.ns:
		this.authorative.push (rr);
		this.header.nscount++;
		break;
	case ns_s.ar:
		this.additional.push (rr);
		this.header.arcount++;
		break;
	}
};

var _msg = new ns_msg ();
var _rr = new ns_rr2 ();
Message.prototype.parseOnce = function (buf)
{
	if (ns_initparse (buf, buf.length, _msg) == -1)
		return false;

	this.header.id = _msg.getId ();
	this.header.qr = _msg.getFlag (ns_f.qr);
	this.header.opcode = _msg.getFlag (ns_f.opcode);
	this.header.aa = _msg.getFlag (ns_f.aa);
	this.header.tc = _msg.getFlag (ns_f.tc);
	this.header.rd = _msg.getFlag (ns_f.rd);
	this.header.ra = _msg.getFlag (ns_f.ra);
	this.header.z = _msg.getFlag (ns_f.a);
	this.header.ad = _msg.getFlag (ns_f.ad);
	this.header.cd = _msg.getFlag (ns_f.cd);
	this.header.rcode = _msg.getFlag (ns_f.rcode);
	this.header.qdcount = _msg.getCount (ns_s.qd);
	this.header.ancount = _msg.getCount (ns_s.an);
	this.header.nscount = _msg.getCount (ns_s.ns);
	this.header.arcount = _msg.getCount (ns_s.ar);

	for (var section = 0; section < ns_s.max; section++) {
		for (var rrnum = 0; rrnum < _msg.getCount (section); rrnum++) {

			if (ns_parserr2 (_msg, section, rrnum, _rr) == -1)
				return false;
			if ((len = ns_name_ntop (_rr.nname, _dname, _dname.Length)) == -1)
				return false;

			var name = _dname.toString ('ascii', 0, len);

			if (section == ns_s.qd) {
				var rr = new MessageQuestion (name, _rr.type, _rr.rr_class);
			}
			else {
				var rr = new MessageRR (name, _rr.type, _rr.rr_class, _rr.ttl);
				if (ns_rdata_unpack (buf, buf.length, _rr.type, _rr.rdata, _rr.rdlength, rr.rdata) == -1) return (-1);
			}

			switch (section) {
			case ns_s.qd:
				this.question.push (rr);
				break;
			case ns_s.an:
				this.answer.push (rr);
				break;
			case ns_s.ns:
				this.authorative.push (rr);
				break;
			case ns_s.ar:
				this.additional.push (rr);
				break;
			}
		}
	}
	return true;
};

var _newmsg = new ns_newmsg ();
var _rdata = new Buffer (512);
Message.prototype.writeOnce = function (buf, bufsiz)
{
	if (ns_newmsg_init (buf, bufsiz, _newmsg) == -1)
		return (-1);

	_newmsg.setId (this.header.id);
	_newmsg.setFlag (ns_f.qr, this.header.qr);
	_newmsg.setFlag (ns_f.opcode, this.header.opcode);
	_newmsg.setFlag (ns_f.aa, this.header.aa);
	_newmsg.setFlag (ns_f.tc, this.header.tc);
	_newmsg.setFlag (ns_f.rd, this.header.rd);
	_newmsg.setFlag (ns_f.ra, this.header.ra);
	_newmsg.setFlag (ns_f.z, this.header.z);
	_newmsg.setFlag (ns_f.ad, this.header.ad);
	_newmsg.setFlag (ns_f.cd, this.header.cd);
	_newmsg.setFlag (ns_f.rcode, this.header.rcode);

	for (var section = 0; section < ns_s.max; section++) {
		var arr;
		switch (section) {
		case ns_s.qd:
			arr = this.question;
			break;
		case ns_s.an:
			arr = this.answer;
			break;
		case ns_s.ns:
			arr = this.authorative;
			break;
		case ns_s.ar:
			arr = this.additional;
			break;
		}
		for (var rrnum = 0; rrnum < arr.length; rrnum++) {
			var rr = arr[rrnum];

			var len;
			if ((len = _string.write (rr.name, 0, 'ascii')) == _string.length)
				return (-1);
			_string[len] = 0;
			if (ns_name_pton (_string, _dname, _dname.length) == -1)
				return (-1);

			if (section == ns_s.qd) {
				if (ns_newmsg_q (_newmsg, _dname, rr.type, rr.class2) == -1) {
					return (-1);
				}
			}
			else {
				var nrdata = 0;
				if ((nrdata = ns_rdata_pack (rr.type, rr.rdata, _rdata, 0, _rdata.length)) == -1)
					return (-1);
				if (ns_newmsg_rr (_newmsg, section, _dname, rr.type, rr.class2, rr.ttl, nrdata, _rdata) == -1) {
					return (-1);
				}
			}
		}
	}
	var n = ns_newmsg_done (_newmsg);
	return (n);
};

var _maxmsg = new Buffer (ns_maxmsg);
Message.prototype.sendTo = function (socket, port, host)
{
	var n;
	if ((n = this.writeOnce (_maxmsg, _maxmsg.length)) != -1) {
		//hexdump (_maxmsg, n, 16);

		var tmp = new Buffer (n);
		_maxmsg.copy (tmp, 0, 0, n);
		socket.send (tmp, 0, n, port, host, function (err, nbytes) {
			if (err) debug (err);
		});
	}
};

function ServerRequest (socket, rinfo)
{
	Message.call (this);

	this.socket = socket;
	this.rinfo = rinfo;
}
sys.inherits (ServerRequest, Message);
exports.ServerRequest = ServerRequest;

function ServerResponse (req)
{
	Message.call (this);

	this.socket = req.socket;
	this.rinfo = req.rinfo;

	// edns
	for (var i = 0; i < req.answer.length; i++) {
		var rr = req.rr[i];

		if (rr.type != ns_t.opt) continue;

		var extended_rcode = rr.rdata[0];
		var udp_payload_size = rr.rdata[1];
		var version = rr.rdata[2];
		var z = rr.rdata[3];

		if (version != 0) continue; // only support edns0

		// useful in Message.prototype.sendTo
		this.edns = {
			extended_rcode: extended_rcode,
			udp_payload_size: udp_payload_size,
			version: version,
			z: z
		};
	}

	// request and response id are equal 
	this.header.id = req.header.id;
	// query type = answer
	this.header.qr = 1;
	// request and response rd bit are equal
	this.header.rd = req.header.rd;
	// request and response question sections are equal
	this.header.qdcount = req.header.qdcount;
	this.question = req.question;
}
sys.inherits (ServerResponse, Message);
exports.ServerResponse = ServerResponse;

ServerResponse.prototype.send = function ()
{
	this.sendTo (this.socket, this.rinfo.port, this.rinfo.address);
};

function Server (type, requestListener)
{
	dgram.Socket.call (this, type);

	if (requestListener) {
		this.on("request", requestListener);
	}

	this.on ("message", messageListener);
};
sys.inherits (Server, dgram.Socket);
exports.Server = Server;

exports.createServer = function ()
{
	var type = 'udp4';
	var requestListener = null;
	if ((arguments.length >= 1) && (typeof arguments[0] == 'string')) {
		type = arguments[0];
	}
	if ((arguments.length >= 2) && (typeof arguments[1] == 'function')) {
		requestListener = arguments[1];
	}
	return new Server (type, requestListener);
};

function messageListener (msg, rinfo)
{
	var req = new ServerRequest (this, rinfo);
	
	if (req.parseOnce (msg)) {
		var res = new ServerResponse (req);
		this.emit ('request',  req, res);
	}
};

function ClientRequest (socket, rinfo)
{
	Message.call (this);

	this.socket = socket;
	this.rinfo = rinfo;
}
sys.inherits (ClientRequest, Message);
exports.ClientRequest = ClientRequest;

ClientRequest.prototype.send = function ()
{
        this.sendTo (this.socket, this.rinfo.port, this.rinfo.address);
};

function ClientResponse (socket, rinfo)
{
	Message.call (this);

	this.socket = socket;
	this.rinfo = rinfo;
}
sys.inherits (ClientResponse, Message);
exports.ClientResponse = ClientResponse;

function Client (type, responseListener)
{
	dgram.Socket.call (this, type);

	if (responseListener) {
		this.on ("response", responseListener);
	}

	this.on ("message", messageListener_client);
};
sys.inherits (Client, dgram.Socket);
exports.Client = Client;

Client.prototype.request = function (port, host) {
	var req = new ClientRequest (this, {address: host, port: port});
	return req;
};

exports.createClient = function ()
{
	var type = 'udp4';
	var responseListener = null;
	if ((arguments.length >= 1) && (typeof arguments[0] == 'string')) {
		type = arguments[0];
	}
	if ((arguments.length >= 2) && (typeof arguments[1] == 'function')) {
		responseListener = arguments[1];
	}
	return new Client (type, responseListener);
};

function messageListener_client (msg, rinfo)
{
	debug ("messageListener_client: new message");
	//hexdump (msg, msg.length, 16);

	var res = new ClientResponse (this, rinfo);
	
	if (res.parseOnce (msg)) {
		this.emit ('response', res);
	}
};

function hexdump (buf, length, count)
{
	if (!Buffer.isBuffer (buf))
		throw new Error ('argument must be buffer');
	count = (arguments.length > 2) ? arguments[2] : 16;
	util.print (0);
	util.print ('\t');
	for (var i = 0; i < length; i++) {
		util.print (hexvalue[buf[i]]);
		util.print (' ');
		if ((i + 1) % (count / 2)) continue;
		util.print (' ');
		if ((i + 1) % (count)) continue;
		util.print ('\n');
		util.print (i + 1);
		util.print ('\t');
	}
	util.print ('\n');
}

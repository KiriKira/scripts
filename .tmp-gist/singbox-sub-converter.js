var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var RULE_SETS = {
  "geoip-cn": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/cnip.srs",
  "geosite-category-games": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/games.srs",
  "geosite-category-games-cn": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/games-cn.srs",
  "geosite-cn": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/cn.srs",
  "geosite-disney": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/disney.srs",
  "geosite-geolocation-!cn": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/gfw.srs",
  "geosite-google": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/google-cn.srs",
  "geosite-netflix": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/netflix.srs",
  "geosite-openai": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/ai.srs",
  "geosite-telegram": "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/telegramip.srs"
};
var AI_PLATFORM_REGEX = /(google|谷歌|gemini|openai|chatgpt|claude|anthropic|bard|copilot|perplexity|ai\b)/i;
var COUNTRY_PATTERNS = {
  "\u{1F1ED}\u{1F1F0} \u9999\u6E2F\u8282\u70B9": /(hong\s*kong|香港|hk\b)/i,
  "\u{1F1EF}\u{1F1F5} \u65E5\u672C\u8282\u70B9": /(tokyo|japan|日本|jp\b|osaka|大阪)/i,
  "\u{1F1F9}\u{1F1FC} \u53F0\u6E7E\u8282\u70B9": /(taipei|taiwan|台湾|tw\b)/i,
  "\u{1F1F8}\u{1F1EC} \u65B0\u52A0\u5761\u8282\u70B9": /(singapore|新加坡|sg\b)/i,
  "\u{1F1FA}\u{1F1F8} \u7F8E\u56FD\u8282\u70B9": /(los\s*angeles|san\s*jose|united\s*states|美国|us\b|usa\b)/i
};
var PRIVATE_CIDRS = [
  "10.0.0.0/8",
  "100.64.0.0/10",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "224.0.0.0/4",
  "fc00::/7",
  "fe80::/10"
];
function parseClashYAML(text) {
  const proxies = [];
  const proxyGroups = [];
  const rules = [];
  try {
    const decoded = atob(text);
    if (decoded.includes("proxies:") || decoded.includes("proxy-providers:")) {
      text = decoded;
    }
  } catch (e) {
  }
  const lines = text.split("\n");
  const proxiesSection = extractYamlSection(lines, "proxies:");
  const groupsSection = extractYamlSection(lines, "proxy-groups:");
  const rulesSection = extractYamlSection(lines, "rules:");
  for (const item of proxiesSection) {
    const proxy = parseProxy(item);
    if (proxy) proxies.push(proxy);
  }
  for (const item of groupsSection) {
    const group = parseProxyGroup(item);
    if (group) proxyGroups.push(group);
  }
  for (const line of rulesSection) {
    let rule = line.trim().replace(/^['"]|['"]$/g, "");
    if (rule && !rule.startsWith("#")) {
      const hashIdx = rule.indexOf("#");
      if (hashIdx > -1) rule = rule.substring(0, hashIdx).trim();
      if (rule) rules.push(rule);
    }
  }
  return { proxies, proxyGroups, rules };
}
__name(parseClashYAML, "parseClashYAML");
function extractYamlSection(lines, sectionHeader) {
  const items = [];
  let inSection = false;
  let currentItemLines = [];
  let sectionIndent = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/\r$/, "");
    const trimmed = stripped.trimStart();
    const indent = stripped.length - trimmed.length;
    if (!trimmed || trimmed.startsWith("#")) {
      if (inSection && currentItemLines.length) {
        currentItemLines.push(stripped);
      }
      continue;
    }
    if (!inSection) {
      if (trimmed === sectionHeader || trimmed.startsWith(sectionHeader)) {
        sectionIndent = indent;
        inSection = true;
      }
      continue;
    }
    if (trimmed.includes(":") && !trimmed.startsWith("-")) {
      if (indent <= sectionIndent) {
        if (currentItemLines.length) {
          items.push(currentItemLines.join("\n"));
          currentItemLines = [];
        }
        inSection = false;
        break;
      }
    }
    const listIndent = (sectionIndent || 0) + 2;
    const isListItem = indent === listIndent && (trimmed === "-" || trimmed.startsWith("- "));
    if (isListItem) {
      if (currentItemLines.length) {
        items.push(currentItemLines.join("\n"));
        currentItemLines = [];
      }
      const content = trimmed === "-" ? "" : trimmed.substring(2);
      currentItemLines.push(content);
    } else if (currentItemLines.length) {
      if (indent > listIndent || indent === listIndent && !trimmed.startsWith("-") && !trimmed.includes(":")) {
        currentItemLines.push(trimmed);
      }
    }
  }
  if (currentItemLines.length) {
    items.push(currentItemLines.join("\n"));
  }
  return items;
}
__name(extractYamlSection, "extractYamlSection");
function parseFields(yamlBlock) {
  const fields = {};
  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.substring(0, colonIdx).trim();
    let value = trimmed.substring(colonIdx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (value === "true") value = true;
    else if (value === "false") value = false;
    fields[key] = value;
  }
  return fields;
}
__name(parseFields, "parseFields");
function parseProxy(yamlBlock) {
  const fields = parseFields(yamlBlock);
  const ptype = fields.type;
  const name = fields.name || "Unnamed";
  const server = fields.server || "";
  const port = parseInt(fields.port) || 0;
  if (!ptype) return null;
  const outbound = { tag: name };
  switch (ptype) {
    case "ss":
      outbound.type = "shadowsocks";
      outbound.server = server;
      outbound.server_port = port;
      outbound.method = fields.cipher || "aes-256-gcm";
      outbound.password = fields.password || "";
      break;
    case "ssr":
      outbound.type = "shadowsocksr";
      outbound.server = server;
      outbound.server_port = port;
      outbound.method = fields.cipher || "aes-256-cfb";
      outbound.password = fields.password || "";
      outbound.protocol = fields.protocol || "origin";
      outbound.obfs = fields.obfs || "plain";
      break;
    case "vmess":
      outbound.type = "vmess";
      outbound.server = server;
      outbound.server_port = port;
      outbound.uuid = fields.uuid || "";
      outbound.security = fields.cipher || "auto";
      outbound.alter_id = parseInt(fields.alterId) || 0;
      if (fields.network === "ws") {
        outbound.transport = {
          type: "ws",
          path: fields["ws-path"] || "/",
          headers: { Host: fields["ws-headers"] && fields["ws-headers"].Host || server }
        };
      }
      if (fields.tls) {
        outbound.tls = { enabled: true, server_name: fields.sni || server };
      }
      break;
    case "trojan":
      outbound.type = "trojan";
      outbound.server = server;
      outbound.server_port = port;
      outbound.password = fields.password || "";
      if (fields.sni) {
        outbound.tls = { enabled: true, server_name: fields.sni };
      } else {
        outbound.tls = { enabled: true, server_name: server };
      }
      break;
    case "vless":
      outbound.type = "vless";
      outbound.server = server;
      outbound.server_port = port;
      outbound.uuid = fields.uuid || "";
      outbound.flow = fields.flow || "";
      if (fields.tls) {
        outbound.tls = { enabled: true, server_name: fields.sni || server };
      }
      if (fields.network === "ws") {
        outbound.transport = { type: "ws", path: fields["ws-path"] || "/" };
      }
      break;
    case "hysteria":
      outbound.type = "hysteria";
      outbound.server = server;
      outbound.server_port = port;
      outbound.up_mbps = parseInt(fields.up) || 100;
      outbound.down_mbps = parseInt(fields.down) || 100;
      outbound.auth_str = fields["auth-str"] || fields.password || "";
      break;
    case "hysteria2":
      outbound.type = "hysteria2";
      outbound.server = server;
      outbound.server_port = port;
      outbound.password = fields.password || "";
      break;
    case "tuic":
      outbound.type = "tuic";
      outbound.server = server;
      outbound.server_port = port;
      outbound.uuid = fields.uuid || "";
      outbound.password = fields.password || "";
      break;
    case "http":
      outbound.type = "http";
      outbound.server = server;
      outbound.server_port = port;
      outbound.username = fields.username || "";
      outbound.password = fields.password || "";
      if (fields.tls) outbound.tls = { enabled: true };
      break;
    case "socks5":
      outbound.type = "socks";
      outbound.server = server;
      outbound.server_port = port;
      break;
    default:
      return null;
  }
  return outbound;
}
__name(parseProxy, "parseProxy");
function parseProxyGroup(yamlBlock) {
  const fields = parseFields(yamlBlock);
  const name = fields.name || "Unnamed Group";
  const gtype = fields.type || "select";
  const proxies = [];
  let inProxies = false;
  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("proxies:")) {
      inProxies = true;
      const val = trimmed.substring(8).trim();
      if (val.startsWith("[")) {
        const listStr = val.replace(/^\[|\]$/g, "");
        for (const p of listStr.split(",")) {
          proxies.push(p.trim().replace(/^['"]|['"]$/g, ""));
        }
        inProxies = false;
      }
      continue;
    }
    if (inProxies && trimmed.startsWith("- ")) {
      proxies.push(trimmed.substring(2).replace(/^['"]|['"]$/g, ""));
    } else if (inProxies && !trimmed.startsWith("- ") && !trimmed.startsWith(" ")) {
      inProxies = false;
    }
  }
  if (["select", "selector"].includes(gtype)) {
    return { type: "selector", tag: name, outbounds: proxies, default: proxies[0] || "" };
  } else if (["url-test", "urltest"].includes(gtype)) {
    return {
      type: "urltest",
      tag: name,
      outbounds: proxies,
      url: fields.url || "https://www.gstatic.com/generate_204",
      interval: fields.interval || "5m"
    };
  } else if (["fallback", "load-balance"].includes(gtype)) {
    return { type: "selector", tag: name, outbounds: proxies, default: proxies[0] || "" };
  }
  return null;
}
__name(parseProxyGroup, "parseProxyGroup");
function matchCountry(tag) {
  for (const [country, regex] of Object.entries(COUNTRY_PATTERNS)) {
    if (regex.test(tag)) return country;
  }
  return null;
}
__name(matchCountry, "matchCountry");
function buildConfig(params) {
  const { proxies, proxyGroups, rules: clashRules } = params.clashData;
  const headscaleUrl = params.headscale || "";
  const authKey = params.authKey || "YOUR_HEADSCALE_PREAUTH_KEY_HERE";
  const hostname = params.hostname || "sing-box-device";
  const exitNode = params.exitNode || "";
  const exitWifi = params.exitWifi || "Synopsys";
  const nodeTags = proxies.map((p) => p.tag);
  const outbounds = [];
  outbounds.push({ type: "direct", tag: "direct" });
  outbounds.push({ type: "block", tag: "block" });
  for (const proxy of proxies) {
    outbounds.push(proxy);
  }
  const mainProxy = "\u{1F680} \u8282\u70B9\u9009\u62E9";
  const countryNodes = {};
  for (const tag of nodeTags) {
    const country = matchCountry(tag);
    if (country) {
      countryNodes[country] = countryNodes[country] || [];
      countryNodes[country].push(tag);
    }
  }
  const aiNodes = nodeTags.filter((t) => AI_PLATFORM_REGEX.test(t));
  outbounds.push({
    type: "urltest",
    tag: "\u267B\uFE0F \u81EA\u52A8\u9009\u62E9",
    outbounds: [...nodeTags],
    url: "https://www.gstatic.com/generate_204",
    interval: "5m"
  });
  const countryGroups = [];
  for (const [country, nodes] of Object.entries(countryNodes)) {
    const tag = country;
    outbounds.push({
      type: "urltest",
      tag,
      outbounds: nodes,
      url: "https://www.gstatic.com/generate_204",
      interval: "5m"
    });
    countryGroups.push(tag);
  }
  const allChoices = ["\u267B\uFE0F \u81EA\u52A8\u9009\u62E9", ...countryGroups];
  outbounds.push({
    type: "selector",
    tag: mainProxy,
    outbounds: allChoices,
    default: "\u267B\uFE0F \u81EA\u52A8\u9009\u62E9"
  });
  const svcChoices = [mainProxy, ...countryGroups];
  const serviceSelectors = ["\u{1F4C8} \u7F51\u7EDC\u6D4B\u8BD5", "\u{1F3A5} \u5948\u98DE\u89C6\u9891", "\u{1F4F9} \u6CB9\u7BA1\u89C6\u9891", "\u{1F30D} \u56FD\u5916\u5A92\u4F53", "\u{1F4F2} \u7535\u62A5\u6D88\u606F", "\u{1F3AE} \u6E38\u620F\u5E73\u53F0", "\u{1F579}\uFE0F \u6E38\u620F\u670D\u52A1"];
  for (const svc of serviceSelectors) {
    outbounds.push({
      type: "selector",
      tag: svc,
      outbounds: svcChoices,
      default: mainProxy
    });
  }
  const aiChoices = [mainProxy, ...countryGroups];
  if (aiNodes.length > 0) {
    const aiAutoTag = "\u{1F916} AI \u81EA\u52A8";
    outbounds.push({
      type: "urltest",
      tag: aiAutoTag,
      outbounds: aiNodes,
      url: "https://www.gstatic.com/generate_204",
      interval: "5m"
    });
    aiChoices.unshift(aiAutoTag);
  }
  const aiSelector = {
    type: "selector",
    tag: "\u{1F916} AI \u5E73\u53F0",
    outbounds: aiChoices,
    default: aiNodes.length > 0 ? "\u{1F916} AI \u81EA\u52A8" : mainProxy
  };
  outbounds.push(aiSelector);
  outbounds.push({
    type: "selector",
    tag: "\u{1F41F} \u6F0F\u7F51\u4E4B\u9C7C",
    outbounds: [mainProxy, ...countryGroups, "direct"],
    default: mainProxy
  });
  const routeRules = [];
  routeRules.push({ action: "sniff" });
  routeRules.push({
    wifi_ssid: ["DOWNTOWNBABY"],
    ip_cidr: ["192.168.31.0/24"],
    outbound: "direct"
  });
  if (headscaleUrl) {
    routeRules.push({
      ip_cidr: ["10.0.0.0/24", "192.168.31.0/24"],
      outbound: "ts-endpoint"
    });
  }
  routeRules.push({ protocol: "dns", action: "hijack-dns" });
  if (headscaleUrl && exitNode && exitWifi) {
    routeRules.push({
      wifi_ssid: [exitWifi],
      domain_suffix: ["kiri.homes"],
      outbound: "ts-endpoint"
    });
    routeRules.push({
      wifi_ssid: [exitWifi],
      rule_set: ["geosite-cn", "geoip-cn"],
      outbound: "ts-endpoint"
    });
    routeRules.push({
      wifi_ssid: [exitWifi],
      outbound: "direct"
    });
  }
  if (headscaleUrl) {
    routeRules.push({ domain_suffix: ["kiri.homes"], outbound: "ts-endpoint" });
  }
  routeRules.push({ domain_suffix: ["deepseek.com"], outbound: "direct" });
  routeRules.push({ rule_set: ["geosite-cn"], outbound: "direct" });
  routeRules.push({ rule_set: ["geoip-cn"], outbound: "direct" });
  routeRules.push({ rule_set: ["geosite-openai"], outbound: "\u{1F916} AI \u5E73\u53F0" });
  routeRules.push({ rule_set: ["geosite-google"], outbound: "\u{1F916} AI \u5E73\u53F0" });
  routeRules.push({
    domain_suffix: ["googleapis.com", "google.com", "google", "g.ai", "deepmind.com", "kaggle.com", "tensorflow.org", "tfhub.dev"],
    outbound: "\u{1F916} AI \u5E73\u53F0"
  });
  routeRules.push({ rule_set: ["geosite-netflix"], outbound: "\u{1F3A5} \u5948\u98DE\u89C6\u9891" });
  routeRules.push({ rule_set: ["geosite-disney"], outbound: "\u{1F3A5} \u5948\u98DE\u89C6\u9891" });
  routeRules.push({ rule_set: ["geosite-telegram"], outbound: "\u{1F4F2} \u7535\u62A5\u6D88\u606F" });
  routeRules.push({ rule_set: ["geosite-category-games"], outbound: "\u{1F3AE} \u6E38\u620F\u5E73\u53F0" });
  routeRules.push({
    ip_cidr: [...PRIVATE_CIDRS],
    outbound: "direct"
  });
  routeRules.push({ rule_set: ["geosite-geolocation-!cn"], outbound: mainProxy });
  const dns = {
    servers: [
      { tag: "dns_direct", type: "https", server: "223.5.5.5", domain_resolver: "dns_resolver" },
      { tag: "dns_proxy", type: "https", server: "1.1.1.1", domain_resolver: "dns_resolver" },
      { tag: "dns_fakeip", type: "fakeip", inet4_range: "28.0.0.0/8", inet6_range: "fc00::/16" },
      { tag: "dns_resolver", type: "https", server: "223.5.5.5" }
    ],
    rules: [
      { domain_suffix: ["kiri.homes"], server: "dns_direct" },
      { rule_set: ["geosite-cn"], server: "dns_direct" },
      { rule_set: ["geosite-category-games-cn"], server: "dns_direct" },
      { query_type: ["A", "AAAA"], server: "dns_fakeip" }
    ],
    final: "dns_proxy",
    strategy: "prefer_ipv4",
    reverse_mapping: true
  };
  const ruleSets = [];
  const usedRuleSetTags = /* @__PURE__ */ new Set();
  for (const rule of routeRules) {
    if (rule.rule_set) {
      for (const tag of rule.rule_set) usedRuleSetTags.add(tag);
    }
  }
  for (const rule of dns.rules) {
    if (rule.rule_set) {
      for (const tag of rule.rule_set) usedRuleSetTags.add(tag);
    }
  }
  for (const tag of usedRuleSetTags) {
    if (RULE_SETS[tag]) {
      ruleSets.push({
        type: "remote",
        tag,
        format: "binary",
        url: RULE_SETS[tag]
      });
    }
  }
  const inbounds = [
    {
      type: "tun",
      tag: "tun-in",
      interface_name: "tun0",
      address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
      mtu: 9e3,
      auto_route: true,
      strict_route: true,
      stack: "mixed"
    },
    {
      type: "mixed",
      tag: "mixed-in",
      listen: "127.0.0.1",
      listen_port: 2080
    }
  ];
  const config = {
    log: { level: "info", timestamp: true },
    dns,
    inbounds,
    outbounds,
    route: {
      rules: routeRules,
      final: "\u{1F41F} \u6F0F\u7F51\u4E4B\u9C7C",
      rule_set: ruleSets,
      auto_detect_interface: true,
      default_domain_resolver: "dns_resolver"
    }
  };
  if (headscaleUrl) {
    const tsEndpoint = {
      type: "tailscale",
      tag: "ts-endpoint",
      control_url: headscaleUrl,
      auth_key: authKey,
      hostname,
      accept_routes: true,
      ephemeral: false,
      domain_resolver: "dns_resolver"
    };
    if (exitNode) {
      tsEndpoint.exit_node = exitNode;
    }
    config.endpoints = [tsEndpoint];
  }
  config.experimental = {
    clash_api: {
      external_controller: "127.0.0.1:9090",
      external_ui: "",
      secret: "",
      default_mode: "Rule"
    }
  };
  return config;
}
__name(buildConfig, "buildConfig");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const subUrl = url.searchParams.get("sub");
    if (!subUrl) {
      return new Response(
        JSON.stringify({
          error: 'Missing "sub" parameter',
          usage: "GET /?sub=<clash_subscription_url>&headscale=<headscale_url>&hostname=<hostname>&auth_key=<auth_key>&exit_node=<node_name_or_ip>&exit_wifi=Synopsys",
          params: {
            sub: "(required) Clash subscription URL",
            headscale: "(optional) Headscale server URL",
            hostname: "(optional) Tailscale hostname, default: sing-box-device",
            auth_key: "(optional) Headscale preauth key",
            exit_node: "(optional) Tailscale/Headscale exit node name or IP; enables Wi-Fi override routing",
            exit_wifi: "(optional) Wi-Fi SSID for exit-node override, default: Synopsys"
          }
        }, null, 2),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
        }
      );
    }
    try {
      const resp = await fetch(subUrl, {
        headers: { "User-Agent": "clash-verge/2.0.0", "Accept": "*/*" }
      });
      if (!resp.ok) {
        return new Response(
          JSON.stringify({
            error: `Failed to fetch subscription: HTTP ${resp.status}`,
            url: subUrl
          }, null, 2),
          {
            status: 502,
            headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
          }
        );
      }
      const body = await resp.text();
      const clashData = parseClashYAML(body);
      const config = buildConfig({
        clashData,
        headscale: url.searchParams.get("headscale") || "",
        authKey: url.searchParams.get("auth_key") || "",
        hostname: url.searchParams.get("hostname") || "sing-box-device",
        exitNode: url.searchParams.get("exit_node") || "",
        exitWifi: url.searchParams.get("exit_wifi") || "Synopsys"
      });
      return new Response(
        JSON.stringify(config, null, 2),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Content-Disposition": 'attachment; filename="sing-box-config.json"'
          }
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Failed to process subscription",
          message: err.message,
          stack: err.stack
        }, null, 2),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
        }
      );
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

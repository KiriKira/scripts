import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Run: node singbox-sub-converter.test.mjs [path/to/singbox-sub-converter.js]
const path=process.argv[2] || new URL('./singbox-sub-converter.js',import.meta.url);
const source=fs.readFileSync(path,'utf8');
const context=vm.createContext({URL,Response,atob});
vm.runInContext(source.replace(/export\s*\{[\s\S]*?\};/,''),context);
const clone=x=>JSON.parse(JSON.stringify(x));
const profile=()=>({address:['172.16.0.2/32'],private_key:randomBytes(32).toString('base64'),peers:[{address:'192.0.2.1',port:2408,public_key:randomBytes(32).toString('base64'),allowed_ips:['0.0.0.0/0','::/0'],reserved:[0,0,0]}]});
const params={clashData:{proxies:[{type:'socks',tag:'Japan Fixture',server:'192.0.2.2',server_port:1080}],proxyGroups:[],rules:[]},headscale:'https://headscale.example.com',authKey:'test-only',exitNode:'100.64.0.8',exitWifi:'Synopsys'};
for(const warpProfiles of [null,{direct:profile(),chain:profile()}]) {
  const c=clone(context.buildConfig({...params,warpProfiles}));
  assert.equal(c.dns.servers.find(x=>x.tag==='dns_proxy').detour,'🚀 节点选择');
  assert(!c.dns.servers.find(x=>x.tag==='dns_resolver').detour);
  assert.deepEqual(c.http_clients,[{tag:'rule-set-download',detour:'🐟 漏网之鱼'}]);
  assert.equal(c.route.default_http_client,'rule-set-download');
  assert.deepEqual(c.experimental.cache_file,{enabled:true,store_fakeip:true});
  assert.equal(c.experimental.clash_api.external_controller,'127.0.0.1:9090');
  assert.equal(c.route.rules[2].outbound,'🧠 Anthropic');
  assert.equal(c.route.rules[3].outbound,'🧠 Anthropic');
  for(const rule of c.route.rules.filter(x=>x.wifi_ssid)) assert(c.route.rules.indexOf(rule)>3);
  for(const domain of ['sentry.io','statsigapi.net','intercom.io','intercomcdn.com']) assert(c.route.rules[2].domain_suffix.includes(domain));
  assert.deepEqual(c.route.rules[2].domain_keyword,['datadog','sift']);
  if(warpProfiles) {
    assert.equal(c.endpoints.find(x=>x.tag==='🔗 AI 平台 → WARP').detour,'🤖 AI 平台');
    assert(!c.outbounds.find(x=>x.tag==='🤖 AI 平台').outbounds.includes('🔗 AI 平台 → WARP'));
    assert(!c.outbounds.find(x=>x.tag==='🚀 节点选择').outbounds.includes('🔗 AI 平台 → WARP'));
    const graph=new Map([...c.endpoints,...c.outbounds].map(x=>[x.tag,[...(x.outbounds||[]),...(x.detour?[x.detour]:[])]]));
    const visit=(tag,path=[])=>{assert(!path.includes(tag),'dependency cycle');for(const next of graph.get(tag)||[])visit(next,[...path,tag]);};
    for(const tag of graph.keys())visit(tag);
  }
}
for(const dnsLocal of [false,true]) for(const dnsMode of ['fakeip','realip']) {
  const c=clone(context.buildConfig({...params,dnsLocal,dnsMode,warpProfiles:{direct:profile(),chain:profile()}}));
  const direct=c.dns.servers.find(x=>x.tag==='dns_direct');
  const fake=c.dns.servers.find(x=>x.tag==='dns_fakeip');
  const ipRule=c.dns.rules.find(x=>x.query_type);
  assert.equal(direct.type,dnsLocal?'local':'https');
  if(!dnsLocal) assert.equal(direct.server,'223.5.5.5');
  assert.equal(Boolean(fake),dnsMode==='fakeip');
  assert.equal(Boolean(ipRule),dnsMode==='fakeip');
  assert.equal(c.dns.servers.find(x=>x.tag==='dns_resolver').type,'https');
  assert.equal(c.dns.final,'dns_proxy');
  assert.equal(c.dns.reverse_mapping,true);
  assert.equal(c.experimental.cache_file.store_fakeip,dnsMode==='fakeip'?true:undefined);
  assert.equal(c.dns.rules.filter(x=>x.server==='dns_direct').length,3);
}
const legacy=clone(context.buildConfig({...params,useHttpClients:false}));
assert(!legacy.http_clients);assert(!legacy.route.default_http_client);
context.fetch=async()=>new Response('proxies:\n  - name: Fixture\n    type: socks5\n    server: 192.0.2.2\n    port: 1080\n');
for(const flag of ['', '&http_clients=0']) {
  const response=await context.index_default.fetch(new Request('https://example.com/?sub=https://fixture.invalid/'+flag),{},{});
  assert.equal(response.status,200);
  const c=await response.json();assert.equal(Boolean(c.http_clients),!flag);
}
const variant=await (await context.index_default.fetch(new Request('https://example.com/?sub=https://fixture.invalid/&dns_local=1&dns_mode=realip'),{},{}));
const vc=await variant.json();
assert.equal(vc.dns.servers.find(x=>x.tag==='dns_direct').type,'local');
assert(!vc.dns.servers.some(x=>x.type==='fakeip'));
assert(!vc.experimental.cache_file.store_fakeip);
console.log('PASS: DNS proxy transport, DNS local/realip variants, HTTP-client default/legacy switch, highest Anthropic priority, shared-provider rules, WARP chain and acyclic dependencies');

# Junction / Surge 订阅转换 Worker

把 Clash 订阅（`?clash=1` 的 YAML）转换成一份完整的 Junction 客户端配置（纯 Surge 语法，未用 Junction 独占扩展，所以 Surge 也能加载）。

跑在 Cloudflare Workers 上，无 npm 依赖、无打包器：多模块 ES 上传，`src/index.js` 为入口。

```text
GET /?sub=<URL-encoded Clash 订阅>&key=<ACCESS_KEY>   → 完整版（tailnet / WARP / 场景 / 个人规则）
GET /?sub=<URL-encoded Clash 订阅>                    → 脱敏版（通用配置）
```

两种响应都是 `text/plain; charset=utf-8`、`Cache-Control: no-store`，响应头 `X-Junction-Nodes` / `X-Junction-Skipped` 给出节点与跳过计数。

## 访问分级

- `ACCESS_KEY` 非空且与 query 的 `key` 全等 → 完整版；缺失、错误、为空，或根本没配 `ACCESS_KEY`，一律脱敏版（fail-closed，绝不意外放出完整版）。
- 脱敏版不含 tailnet 策略与 `[Tailscale]` 段、场景（如公司 Wi-Fi）规则、家庭内网网段、WARP、个人补充节点、个人应用规则；其余（国内分流、AI/Anthropic、流媒体、电报、游戏、LAN、FINAL）照常。
- 个人凭据只从 Worker secrets 读，不接受 URL 参数覆盖（`auth_key`、`warp_key`、`extra` 之类一律无效）。
- 完整版所需 secret 缺失或格式不对返回 422（不给半份配置）；订阅读取失败 502；订阅 URL 缺失/非法 400；非 GET 405。上游只允许 http(s)，超时 20s，上限 5 MiB。

## Secrets

| 绑定 | 用途 |
|---|---|
| `ACCESS_KEY` | 决定完整版 / 脱敏版 |
| `WARP_PROFILES` | JSON，`direct` 与 `chain` 两个 WireGuard profile |
| `WARP_ACCESS_KEY` | 历史 fixture 兼容用，代码不参与授权 |
| `TS_AUTH_KEY` | Tailscale / Headscale 认证 key |
| `TS_CONTROL_URL` | 控制服务器地址（https） |
| `EXTRA_NODES` | 多行 Surge trojan / hysteria2 代理定义，仅完整版添加 |

`WARP_PROFILES` 结构：`private_key`、`address`（数组）、`mtu`、`peers`（数组，peer 用 `public_key`、`address`、`port`、`allowed_ips`、可选 `reserved` 三字节 → 输出为 `client-id`）。

## 目录结构

```text
src/
  index.js           HTTP 入口、key 分级、上游读取与限制
  config.js          单条 build 流程，按能力渲染各段
  features.js        capability 开关与判定
  clash.js           纯 JS 的 Clash YAML 子集解析器
  proxies.js         trojan / hysteria2 转换、secret 补充节点
  groups.js          国家 smart 组、服务 select 组、成员能力归属
  sections.js        [General] [SSID Setting] [WireGuard] [Tailscale]
  emitter.js         唯一的普通规则 / 逻辑规则序列化器
  rules/
    index.js         模块注册、最终顺序、能力过滤
    constants.js     规则集 URL 构建
    anthropic.js     Anthropic / Claude
    ai.js            OpenAI / Google AI
    china.js         国内域名集 + IP 规则集 + GEOIP
    tailnet.js       内网规则（声明私密能力）
    apps.js          个人应用规则（声明私密能力）
    media.js         流媒体 / Telegram / 游戏
    final.js         LAN 与 FINAL
  scenarios/
    synopsys.js      从基础 blocks 派生：应用 → AI/内网/国内 → 兜底
    home.js          家庭 Wi-Fi 的内网直连派生
test/
  run.mjs            基线逐行对比、结构 / 隐私 / HTTP / 解析器验收
  audit.mjs          独立文本级递归审计器
  deploy_test.py     multipart 与部署读回的离线测试
deploy.py            Python 标准库多模块上传，无构建依赖
```

## 怎么加一条规则

只改对应模块，例如让一个新域名走 `🤖 AI 平台`，编辑 `src/rules/ai.js`，在导出数组里加一条：

```js
{ id: 'example-ai', kind: 'domain-suffix', values: ['ai.example.org'], policy: '🤖 AI 平台' },
```

普通规则行和场景里的例外行都由同一条 descriptor 生成，不用动 `emitter.js` 或场景文件；多个 `values` 会自动折叠成一条 `OR`。

- `kind`：`domain`、`domain-suffix`、`domain-keyword`、`ip-cidr`、`ip-cidr6`、`ip-asn`、`geoip`、`process-name`、`rule-set`、`domain-set`、`subnet`、`final`。
- IP / GEOIP / IP-ASN 以及所有 `RULE-SET` / `DOMAIN-SET`（含逻辑规则内层）自动补 `no-resolve`，避免域名请求在规则评估阶段触发本地解析。
- `ChinaMax_Domain.list` 必须用 `DOMAIN-SET`，`ChinaMax.list` 用 `RULE-SET`（后者不含域名，只有 IP 与杂项）。
- 只应出现在完整版 → 加 `requires: ['privateRules']`；整个模块私密 → 模块里 `export const requires = ['privateRules']`。注册器和场景都会自动过滤。

## 怎么加一个场景

```js
// src/scenarios/office.js
import { scopeRules } from '../emitter.js';
export const requires = ['scenarios', 'privateRules'];
export default function office(blocks, { ssid = 'ExampleOffice' } = {}) {
  return [
    ...scopeRules([...blocks.anthropic, ...blocks.ai], { ssid, fold: true }),
    { id: 'office-fallback', kind: 'subnet', values: [`SSID:${ssid}`], policy: 'DIRECT' },
  ];
}
```

然后在 `src/rules/index.js` import 并加 `{ ...office, derive: true }`。场景只做选择 / 排序 / 覆盖策略，不复制域名与 IP 字面量。

## 本地测试

测试需要两份私有 fixture（含真实节点凭据，**不入库**）：

- `test/clash_sample.yaml`：一份真实 Clash 订阅
- `test/reference.conf`、`test/reference-public.conf`：完整版与脱敏版的基线（脱敏版里节点口令用占位符，测试时在内存里从 yaml 还原）
- 密钥 fixture：默认 `/opt/data/.secrets/junction-secrets.json`，可用 `SECRETS_FILE` 覆盖

```sh
node test/run.mjs
```

覆盖：两种基线逐行一致、结构自检（引用 / 重名 / 环 / smart 只能含代理 / 触发解析的规则是否全带 `no-resolve`）、审计器负向回归、节点转换与 YAML 解析、HTTP 各错误分支与 key 分级、密钥扫描、离线部署脚本。

## 部署

标准库即可，多模块上传（每个 `src/**/*.js` 一个 `application/javascript+module` part，`main_module: src/index.js`）：

```sh
python3 deploy.py upload --dry-run     # 只在本地拼 multipart 并读回校验
python3 deploy.py upload               # 真实上传，随后逐模块读回比对
python3 deploy.py secrets              # 单独推 secrets
```

token 从环境约定的文件读取（`CLOUDFLARE_WORKERS_TOKEN`），脚本不回显、不落盘。`route` 子命令必须显式给出 zone 与 pattern，且要 `--confirm-create-route` 才会真的创建。

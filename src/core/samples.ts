/**
 * Sample pages.
 *
 * These are the kind of pages that actually exist in a Notion workspace: a
 * spec someone pasted out of a Google Doc, a reading log that grew for months,
 * a weekly report written in five minutes. They exist so the playground and
 * the test suite exercise the rules against realistic damage rather than
 * synthetic fixtures.
 */

import type { PolishPage } from "./types";

const paymentSpec: PolishPage = {
  id: "sample-payment-spec",
  title: "支付服务接入文档",
  blocks: [
    {
      id: "pay-1",
      type: "paragraph",
      richText: [
        {
          text: "这份文档描述了商户如何接入我们的支付服务，包括环境准备、密钥申请、下单、支付结果通知与对账五个部分。接入前请确认你已经在商户后台完成企业认证，并且已经拿到了测试环境的 App ID，否则下面所有接口都会返回 401。整个接入流程在顺利的情况下大约需要半天，其中最容易卡住的是回调验签那一步，建议预留额外时间。",
        },
      ],
    },
    { id: "pay-2", type: "heading_1", richText: [{ text: "环境与密钥" }] },
    {
      id: "pay-3",
      type: "paragraph",
      richText: [
        { text: "我们提供沙箱和生产两套环境，域名分别是 " },
        { text: "api-sandbox.example.com", code: true },
        { text: " 和 " },
        { text: "api.example.com", code: true },
        { text: "。两套环境的密钥不通用。" },
      ],
    },
    {
      id: "pay-4",
      type: "paragraph",
      richText: [{ text: "注意：沙箱环境的数据每周日凌晨会清空，不要把沙箱当成长期测试数据的存放地。" }],
    },
    {
      id: "pay-5",
      type: "paragraph",
      richText: [{ text: "申请密钥", bold: true }],
    },
    {
      id: "pay-6",
      type: "paragraph",
      richText: [
        {
          text: "在商户后台的「开发设置」里生成一对 RSA 密钥，私钥自行保管，公钥上传到后台。生成后页面会显示一次私钥内容，离开页面后无法再次查看。",
        },
      ],
    },
    {
      id: "pay-7",
      type: "code",
      language: "plain text",
      richText: [
        {
          text: 'openssl genrsa -out merchant_private.pem 2048\nopenssl rsa -in merchant_private.pem -pubout -out merchant_public.pem\ncurl -X POST https://api-sandbox.example.com/v1/keys \\\n  -H "Authorization: Bearer $APP_TOKEN" \\\n  --data-binary @merchant_public.pem',
        },
      ],
    },
    { id: "pay-8", type: "heading_1", richText: [{ text: "创建订单" }] },
    {
      id: "pay-9",
      type: "paragraph",
      richText: [
        {
          text: "下单接口是整个流程的入口。你需要提供商户订单号、金额（单位为分）、币种、商品描述和回调地址。商户订单号必须全局唯一，重复提交同一个订单号会直接返回已存在的订单而不是报错，这是幂等设计，可以放心重试。金额不接受小数，传 1.5 会被拒绝，一元五角应该传 150。回调地址必须是 https 并且可以被公网访问，我们不支持内网地址和自签证书。",
        },
      ],
    },
    {
      id: "pay-10",
      type: "code",
      language: "plain text",
      richText: [
        {
          text: 'interface CreateOrderRequest {\n  merchantOrderId: string\n  amount: number\n  currency: "CNY" | "USD"\n  description: string\n  notifyUrl: string\n}\n\nconst res = await fetch("/v1/orders", {\n  method: "POST",\n  body: JSON.stringify(payload),\n})',
        },
      ],
    },
    {
      id: "pay-11",
      type: "callout",
      richText: [{ text: "金额字段的单位是分，不是元。这是接入期间最高频的事故原因。" }],
      color: "pink_background",
    },
    { id: "pay-12", type: "heading_1", richText: [{ text: "支付结果通知" }] },
    {
      id: "pay-13",
      type: "paragraph",
      richText: [{ text: "验签流程", bold: true }],
    },
    {
      id: "pay-14",
      type: "paragraph",
      richText: [
        {
          text: "收到回调后必须先验签再处理业务。验签失败的请求一律丢弃，不要因为「看起来是我们的订单」就放过去。签名放在 X-Signature 头里，签名内容是请求体原文，不是解析后重新序列化的 JSON —— 重新序列化会改变字段顺序导致验签失败，这是另一个高频坑。",
        },
      ],
    },
    {
      id: "pay-15",
      type: "paragraph",
      richText: [{ text: "我们会在 24 小时内按 1min / 5min / 15min / 1h / 6h 的间隔重试最多 8 次，直到你的服务返回 2xx。" }],
      color: "purple_background",
    },
    {
      id: "pay-16",
      type: "paragraph",
      richText: [{ text: "" }],
    },
    {
      id: "pay-17",
      type: "paragraph",
      richText: [{ text: "" }],
    },
    {
      id: "pay-18",
      type: "paragraph",
      richText: [{ text: "" }],
    },
    { id: "pay-19", type: "heading_1", richText: [{ text: "对账" }] },
    {
      id: "pay-20",
      type: "paragraph",
      richText: [
        {
          text: "每天凌晨 2 点我们会生成前一天的对账文件，你可以通过对账接口下载。对账文件是 gzip 压缩的 CSV，字段顺序固定。建议每天定时拉取并和自己的订单表核对，金额不一致时以我们的对账文件为准。",
        },
      ],
    },
    {
      id: "pay-21",
      type: "heading_3",
      richText: [{ text: "常见不一致原因" }],
    },
    {
      id: "pay-22",
      type: "bulleted_list_item",
      richText: [{ text: "回调丢失导致本地订单仍为待支付，但实际已支付成功" }],
    },
    {
      id: "pay-23",
      type: "bulleted_list_item",
      richText: [{ text: "退款发生在跨天边界，被计入了不同日期的对账文件" }],
    },
    {
      id: "pay-24",
      type: "bulleted_list_item",
      richText: [{ text: "测试环境订单误入生产统计" }],
    },
    {
      id: "pay-25",
      type: "paragraph",
      richText: [
        { text: "重要：对账差异超过 0.1% 时请立刻联系我们，不要自行调账。", bold: true },
      ],
    },
  ],
};

const readingNotes: PolishPage = {
  id: "sample-reading-notes",
  title: "《思考，快与慢》读书笔记",
  blocks: [
    {
      id: "rn-1",
      type: "paragraph",
      richText: [
        {
          text: "断断续续读了三个月终于读完。这本书的核心框架是把人的思维分成系统一和系统二：系统一快速、自动、情绪化，几乎不耗费注意力；系统二缓慢、费力、需要主动调动。作者花了大半本书在论证一件事 —— 我们以为自己是用系统二在思考，实际上绝大多数判断都由系统一完成，系统二只是事后给出一个听起来合理的解释。",
        },
      ],
    },
    {
      id: "rn-2",
      type: "paragraph",
      richText: [
        {
          text: "锚定效应这一章最让我意外。实验里让被试先转一个明显随机的转盘，再估计非洲国家在联合国的占比，转盘停在 10 的人平均估 25%，停在 65 的人平均估 45%。被试完全知道转盘是随机的，但数字还是影响了他们的判断。这意味着锚定不是因为你相信那个数字，而是因为你看到了它。",
        },
      ],
    },
    {
      id: "rn-3",
      type: "paragraph",
      richText: [
        {
          text: "这个在谈判和定价里其实被大量利用。先报一个高价，哪怕对方知道虚高，最终成交价也会被拉高。反过来说，自己做判断前最好先把别人给的数字挡住，先独立估一个范围出来。",
        },
      ],
    },
    {
      id: "rn-4",
      type: "paragraph",
      richText: [
        {
          text: "可得性启发讲的是我们用「想起来容易不容易」代替「概率高不高」。空难报道多，所以觉得坐飞机危险；身边有人中奖，所以觉得中奖概率不低。媒体报道的频率直接改变了我们对风险的估计，而报道频率和真实频率几乎没关系。",
        },
      ],
      color: "yellow_background",
    },
    {
      id: "rn-5",
      type: "paragraph",
      richText: [
        {
          text: "前景理论是后半本的重点，也是作者拿诺奖的工作。核心是三点：人对变化而非绝对水平敏感；损失带来的痛苦约为同等收益快乐的两倍；面对小概率事件时人会过度反应。这三条合起来能解释保险、彩票、股票长期持有不了这些看似矛盾的行为。",
        },
      ],
      color: "blue_background",
    },
    {
      id: "rn-6",
      type: "paragraph",
      richText: [
        {
          text: "峰终定律那一章我读了两遍。人对一段经历的评价，主要由峰值体验和结束时的感受决定，和持续时长关系很小。冷水实验里，手在冷水里泡 60 秒的被试，比泡 90 秒但最后 30 秒水温略升的被试，更不愿意重复这个过程 —— 尽管后者客观上多受了 30 秒苦。",
        },
      ],
      color: "green_background",
    },
    {
      id: "rn-7",
      type: "paragraph",
      richText: [
        { text: "记忆自我和体验自我是两个不同的人，而做决定的永远是记忆自我。", bold: true },
      ],
      color: "red_background",
    },
    {
      id: "rn-8",
      type: "paragraph",
      richText: [
        {
          text: "读完最大的收获不是记住了一堆偏误名称，而是接受了一个前提：知道偏误存在并不能让你免于偏误。作者自己也说，研究了四十年，他在直觉判断上并没有比普通人好多少。真正有用的做法是把判断交给流程 —— 提前定好标准、分开独立打分、用清单代替印象。",
        },
      ],
    },
    {
      id: "rn-9",
      type: "paragraph",
      richText: [{ text: "下一本准备读《噪声》，据说是同一套框架往组织决策方向的延伸。" }],
    },
  ],
};

const weeklyReport: PolishPage = {
  id: "sample-weekly-report",
  title: "增长组第 42 周周报",
  icon: { type: "emoji", emoji: "📈" },
  blocks: [
    { id: "wr-1", type: "heading_2", richText: [{ text: "本周进展" }] },
    {
      id: "wr-2",
      type: "paragraph",
      richText: [
        { text: "新用户注册转化率从 12.4% 提升到 14.1%，主要来自注册页表单字段从 6 个减到 3 个。" },
      ],
    },
    {
      id: "wr-3",
      type: "paragraph",
      richText: [{ text: "邀请功能灰度到 20% 用户，人均邀请 0.3 人，低于预期的 0.8。" }],
    },
    {
      id: "wr-4",
      type: "paragraph",
      richText: [{ text: "完成渠道归因模型重写，历史数据回溯中，预计下周出结果。" }],
    },
    { id: "wr-5", type: "heading_2", richText: [{ text: "问题与风险" }] },
    {
      id: "wr-6",
      type: "callout",
      richText: [
        { text: "邀请功能数据远低于预期，需要决定是继续优化还是下掉。建议下周三前给出结论。" },
      ],
      color: "orange_background",
    },
    {
      id: "wr-7",
      type: "paragraph",
      richText: [
        { text: "归因模型重写依赖数据组的埋点清洗，对方本周有线上事故，排期可能延后一周。" },
      ],
    },
    { id: "wr-8", type: "heading_2", richText: [{ text: "下周计划" }] },
    {
      id: "wr-9",
      type: "to_do",
      checked: false,
      richText: [{ text: "邀请功能做一轮用户访谈，n=8" }],
    },
    {
      id: "wr-10",
      type: "to_do",
      checked: false,
      richText: [{ text: "注册页继续做 A/B：手机号登录 vs 邮箱登录默认项" }],
    },
    {
      id: "wr-11",
      type: "to_do",
      checked: false,
      richText: [{ text: "归因模型结果评审，拉上数据组和市场" }],
    },
    { id: "wr-12", type: "heading_2", richText: [{ text: "数据明细" }] },
    {
      id: "wr-13",
      type: "code",
      language: "plain text",
      richText: [
        {
          text: "select channel, count(*) as signups, avg(d7_retained::int) as d7\nfrom signups\nwhere created_at >= current_date - 7\ngroup by channel\norder by signups desc",
        },
      ],
    },
  ],
};

/**
 * A short lecture pasted in as a wall of text: one heading level for every
 * section, key points written as ordinary sentences, and colours picked at
 * random. This is the before/after demo for "a plain lecture becomes readable".
 */
const bayesLecture: PolishPage = {
  id: "sample-bayes-lecture",
  title: "贝叶斯定理课堂笔记",
  blocks: [
    {
      id: "by-1",
      type: "paragraph",
      richText: [
        {
          text: "这份笔记讲贝叶斯定理怎么用。先分清条件概率在说什么，再写出公式，最后用一个发病检测的例子算一遍。很多人第一次会把先验和后验写反，算到最后得到一个高得不像话的概率。",
        },
      ],
    },
    { id: "by-2", type: "heading_1", richText: [{ text: "条件概率" }] },
    {
      id: "by-3",
      type: "paragraph",
      color: "green_background",
      richText: [
        {
          text: "P(A|B) 读作在 B 已经发生的前提下 A 发生的概率。它和 P(B|A) 不是一回事。两边的分子都是联合概率，分母一个是 P(B)，一个是 P(A)。",
        },
      ],
    },
    {
      id: "by-4",
      type: "paragraph",
      color: "pink_background",
      richText: [{ text: "考点：P(A|B) 不是 P(B|A)。竖线右边才是已经发生的那一件事。" }],
    },
    { id: "by-5", type: "heading_1", richText: [{ text: "公式" }] },
    {
      id: "by-6",
      type: "paragraph",
      color: "orange",
      richText: [{ text: "贝叶斯定理把后验写成先验乘上似然，再除以证据。证据用全概率公式展开。" }],
    },
    {
      id: "by-7",
      type: "equation",
      expression: "P(A\\mid B)=\\frac{P(B\\mid A)\\,P(A)}{P(B)}",
    },
    {
      id: "by-8",
      type: "paragraph",
      color: "purple_background",
      richText: [{ text: "重要：先写联合概率 P(A,B)，再除以边缘概率 P(B)。" }],
    },
    { id: "by-9", type: "heading_1", richText: [{ text: "发病检测" }] },
    {
      id: "by-10",
      type: "paragraph",
      richText: [
        {
          text: "某种病的患病率是 1%。检测在患病时的阳性率是 99%，没患病时的假阳性率是 5%。现在测出了阳性，患病的概率并不是 99%。把 1% 的先验和 5% 的假阳性放进公式里算，后验大约只有 17%。",
        },
      ],
    },
    {
      id: "by-11",
      type: "paragraph",
      richText: [{ text: "计算步骤", bold: true }],
    },
    {
      id: "by-12",
      type: "paragraph",
      richText: [
        { text: "真阳性约占人群的 0.99%，假阳性约占 4.95%。阳性里真患病的比例大约是 0.99 / (0.99 + 4.95)。" },
      ],
    },
    { id: "by-13", type: "heading_1", richText: [{ text: "常见错误" }] },
    {
      id: "by-14",
      type: "paragraph",
      color: "red_background",
      richText: [{ text: "注意：不要把先验 P(A) 和后验 P(A|B) 写反。阳性结果更新的是后验，不是先验。" }],
    },
  ],
};

export const SAMPLE_PAGES: PolishPage[] = [paymentSpec, readingNotes, weeklyReport, bayesLecture];

export const SAMPLE_META: Array<{ id: string; label: string; blurb: string; suggestedTheme: string }> = [
  {
    id: paymentSpec.id,
    label: "支付服务接入文档",
    blurb: "从 Google Doc 粘过来的技术文档：H1 当章节、加粗当标题、代码块没语言、callout 配色乱",
    suggestedTheme: "clean-docs",
  },
  {
    id: readingNotes.id,
    label: "《思考，快与慢》读书笔记",
    blurb: "攒了三个月的读书笔记：一个标题都没有，九段长文，五种背景色各用一次",
    suggestedTheme: "warm-notes",
  },
  {
    id: weeklyReport.id,
    label: "增长组第 42 周周报",
    blurb: "结构还不错的周报：缺目录、缺分隔、callout 没图标、SQL 没高亮",
    suggestedTheme: "focus-brief",
  },
  {
    id: bayesLecture.id,
    label: "贝叶斯定理课堂笔记",
    blurb: "一节写得很普通的概率课：标题全是一级、考点淹没在正文里、颜色随手涂、没有图标和封面",
    suggestedTheme: "clean-docs",
  },
];

export function getSample(id: string): PolishPage | undefined {
  return SAMPLE_PAGES.find((p) => p.id === id);
}

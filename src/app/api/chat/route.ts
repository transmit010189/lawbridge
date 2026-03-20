import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `你是 LawBridge AI 法律助手，專門協助在台灣工作的外籍勞工了解勞動權益。你精通台灣勞動相關法規，以簡單清楚的方式解答法律問題。

## 你的角色
- 你是一個法律資訊提供者，不是律師
- 你的回答僅供參考，不構成正式法律意見
- 遇到複雜案件時，建議使用者尋求專業律師諮詢
- 使用者可能是外籍移工，請用簡單清楚的語言回答
- 請用使用者的語言回答（中文、英文、印尼語、越南語、泰語）

## 核心法規知識

### 一、勞動基準法（Labor Standards Act）重點條文

**工資相關**
- 第21條：工資由勞雇雙方議定之，但不得低於基本工資。2025年基本工資為月薪 28,590 元新台幣，時薪 190 元
- 第22條：工資應全額直接給付勞工。除法令另有規定或勞雇雙方另有約定，雇主不得預扣勞工工資
- 第23條：工資之給付，每月至少定期給付二次。雇主應提供工資明細及計算方式細項
- 第26條：雇主不得預扣勞工工資作為違約金或賠償費用

**工時相關**
- 第30條：勞工正常工作時間，每日不得超過八小時，每週不得超過四十小時
- 第32條：雇主延長勞工工作時間（加班），連同正常工時每日不得超過十二小時。每月延長工時總時數不得超過四十六小時（經工會或勞資會議同意可延長至54小時，3個月不超過138小時）
- 第24條：加班費計算：
  - 延長工時2小時以內：按平日每小時工資額再給 1/3 以上（即 1.34 倍）
  - 再延長工時在2小時以內：按平日每小時工資額再給 2/3 以上（即 1.67 倍）
  - 休息日工作：前2小時給 1⅓ 倍、3-8小時給 1⅔ 倍、9-12小時給 2⅔ 倍
- 第39條：例假日、休假日及特別休假，工資照給。雇主經徵得勞工同意於休假日工作者，工資應加倍發給

**休假相關**
- 第36條：勞工每七日中應有二日之休息，其中一日為例假，一日為休息日
- 第37條：內政部規定應放假之紀念日、節日、勞動節及其他休假
- 第38條：特別休假/年假：
  - 6個月以上1年未滿：3日
  - 1年以上2年未滿：7日
  - 2年以上3年未滿：10日
  - 3年以上5年未滿：每年14日
  - 5年以上10年未滿：每年15日
  - 10年以上：每1年加給1日，加至30日為止

**解僱/離職相關**
- 第11條：非有法定事由（歇業、虧損、業務緊縮、不可抗力、業務性質變更或勞工不能勝任），雇主不得預告勞工終止勞動契約
- 第12條：勞工有重大違規時，雇主得不經預告終止契約（暴力、重大侮辱、受刑事處分、違反契約情節重大、故意損害、無正當理由曠職三日或一個月內曠職六日）
- 第14條：雇主有違反契約或法令時，勞工得不經預告終止契約並要求資遣費
- 第16條：預告期間：
  - 工作3個月以上1年未滿：10日前預告
  - 工作1年以上3年未滿：20日前預告
  - 工作3年以上：30日前預告
- 第17條：資遣費計算——舊制：每滿1年發給1個月平均工資之資遣費。新制（適用勞退新制）：每滿1年發給1/2個月平均工資，最高發給6個月

**職災相關**
- 第59條：勞工因遭遇職業災害而致死亡、失能、傷害或疾病時，雇主應依下列規定予以補償：
  - 必要之醫療費用由雇主負擔
  - 在醫療中不能工作時，雇主應按原領工資數額予以補償
  - 經治療終止後，身體遺存障害者，雇主應按平均工資及失能程度一次給予失能補償
  - 勞工因職業災害或罹患職業病而死亡時，雇主除給與五個月平均工資之喪葬費外，並給與其遺屬四十個月平均工資之死亡補償
- 第13條：勞工在職災醫療期間，雇主不得終止契約

### 二、就業服務法（Employment Service Act）— 外籍勞工相關

**仲介費規定**
- 第40條：私立就業服務機構及其從業人員不得收取超額費用、扣留他人護照或居留證件
- 仲介費上限：
  - 第1年：每月不得超過 1,800 元
  - 第2年起：每月不得超過 1,700 元
  - 第3年：每月不得超過 1,500 元
  - 總計3年仲介服務費上限為 60,000 元
  - 來源國仲介費另計（依各國規定不同）
- 雇主不得向外籍勞工收取任何費用（包括機票、體檢、住宿等不得轉嫁）

**外國人工作權益**
- 第42條：外籍勞工之工作權益應予保障
- 第57條：雇主聘僱外國人不得有下列情事：聘僱未經許可之外國人、以本人名義聘僱外國人為他人工作、指派受聘僱之外國人從事許可以外之工作、未經許可變更外國人之工作場所
- 第73條：雇主聘僱之外國人，連續曠職三日失去聯繫或聘僱關係終止時，雇主應於三日內通知主管機關及入出國管理機關

**轉換雇主**
- 第59條：外國人受聘僱從事工作，其聘僱許可終止或雇主關廠歇業等情形，經中央主管機關核准得轉換雇主
- 轉換期間不得超過60天

### 三、勞工保險相關
- 凡適用勞工保險的外籍勞工，均應參加勞工保險
- 保險項目：普通事故（傷病、失能、老年、死亡給付）及職業災害保險
- 雇主負擔保費70%，勞工自付20%，政府補助10%
- 勞工如遇保險事故發生時，得依規定請領保險給付

### 四、勞工退休金條例（勞退新制）
- 雇主應為適用新退休制之勞工（含外籍勞工），每月提繳不低於其月工資6%之退休金
- 外籍勞工離境後可申請一次請領退休金
- 帳戶跟著個人走，轉換工作不影響

### 五、職業安全衛生法
- 第6條：雇主對防止機械、設備或器具等引起之危害，應有符合規定之必要安全衛生設備及措施
- 第20條：雇主僱用勞工時，應施行體格檢查；對在職勞工施行定期健康檢查
- 雇主應提供適當勞工安全裝備，包括防護具
- 勞工得拒絕危險性工作

### 六、性別平等工作法
- 禁止性別歧視及性騷擾
- 產假：分娩前後給予產假八週
- 雇主不得因勞工結婚、懷孕、分娩或育兒而解僱

## 常見問題快速回答範例
1. **加班費怎麼算？** → 引用勞基法第24條：前2小時1.34倍、再2小時1.67倍
2. **仲介可以收多少錢？** → 每月上限1,500-1,800元，3年共6萬。引用就服法第40條
3. **雇主可以直接扣薪水嗎？** → 不可以！依勞基法第22、26條，工資應全額給付
4. **護照被扣了怎麼辦？** → 違法！依就服法第40條，請撥1955申訴
5. **工傷怎麼辦？** → 雇主應負擔全部醫療費用、補償工資。引用勞基法第59條
6. **轉換雇主可以嗎？** → 可以，依就服法第59條，但須60天內轉換
7. **基本工資多少？** → 2025年月薪28,590元，時薪190元
8. **可以拒絕加班嗎？** → 延長工時須經勞工同意。引用勞基法第32條
9. **勞退金可以領嗎？** → 可以，離境後可一次請領。引用勞退條例

## 申訴管道
- **1955 外籍勞工諮詢保護專線**：24小時免費，提供中文、英文、印尼語、越南語、泰語服務
- **勞動部勞工諮詢申訴專線**：1966
- **各縣市勞動局/勞工處**
- **法律扶助基金會**：可申請免費法律諮詢

## 回答要求
1. 先直接回答問題
2. 引用具體法條（附上簡短內容）
3. 如有具體數字（金額、天數），一定要給出
4. 最後提供實際建議與申訴管道
5. 保持簡潔，使用者閱讀方便即可
6. 如果問題超出你的知識範圍，坦白說明並建議撥打 1955 或找律師`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { messages, locale } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const localeInstruction: Record<string, string> = {
      "zh-TW": "請使用繁體中文回答。",
      en: "Please answer in English.",
      id: "Silakan jawab dalam Bahasa Indonesia.",
      vi: "Vui lòng trả lời bằng tiếng Việt.",
      th: "โปรดตอบเป็นภาษาไทย",
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction:
        SYSTEM_PROMPT +
        "\n\n" +
        (localeInstruction[locale] || localeInstruction["zh-TW"]),
    });

    // Build chat history from messages (skip the welcome message)
    const history = messages
      .filter((m: { role: string; text: string }) => m.role !== "system")
      .map((m: { role: string; text: string }) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

    // The last message is the user's new question
    const lastMessage = history.pop();
    if (!lastMessage || lastMessage.role !== "user") {
      return Response.json({ error: "No user message" }, { status: 400 });
    }

    const chat = model.startChat({ history });

    // Stream the response
    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMsg })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}

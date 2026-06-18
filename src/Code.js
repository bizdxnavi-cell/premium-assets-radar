// ==========================================
// Global Premium Assets AI-Radar (DSSoT V8.0)
// メインエンジン (Code.js) - カラム完全整合版
// ==========================================

const scriptProperties = PropertiesService.getScriptProperties();

const LEDGER_SHEET_NAME = 'Target_Ledger';
const MASTER_SHEET_NAME = 'Master_Data';

const SPREADSHEET_ID    = scriptProperties.getProperty('SPREADSHEET_ID');
const EBAY_APP_ID       = scriptProperties.getProperty('EBAY_APP_ID');
const EBAY_CERT_ID      = scriptProperties.getProperty('EBAY_CERT_ID');
const EBAY_CAMPAIGN_ID  = scriptProperties.getProperty('EBAY_CAMPAIGN_ID');
const GEMINI_API_KEY    = scriptProperties.getProperty('GEMINI_API_KEY');

// 【重要】フロントエンド（ハブサイト）のURLを設定
const HUB_SITE_URL      = 'https://bizdxnavi-cell.github.io/premium-assets-radar/';

// ==========================================
// 1. 自律型お宝発掘エンジン
// ==========================================
function discoverNewAssets() {
  if (!SPREADSHEET_ID) throw new Error("[System Error] SPREADSHEET_ID が設定されていません。");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  if (!sheet) throw new Error(`[System Error] ${LEDGER_SHEET_NAME} タブが見つかりません。`);

  Logger.log("[Discovery] 全世界から最新的限定・プレミア情報を収集しています...");
  if (!GEMINI_API_KEY) throw new Error("[System Error] GEMINI_API_KEY が設定されていません。");

  const prompt = `
あなたは世界中のリセール市場を監視するトップアナリストです。
日本、アメリカ、欧州で現在「資産価値」が急騰しているもしくは急騰まじか、あるいは近日発売される限定商品（高付加価値商品）を10個ピックアップしてください。

【調査対象ソース（シミュレーション）】
- StockX (Watches/Collectibles)
- Hypebeast (English & Japanese)
- eBay Search Trends (Global)
- PokeBeach / Pokemon Card Release Calendar

【選定基準】
- カテゴリ: 高級時計、フィギュア、限定玩具、トレーディングカード,スニーカー、コラボグッズのみ。
- 除外対象（絶対禁止）: チケット、金券、クーポン、コスメ、食品、薬品、衣類（革製品）。

【出力形式】
以下のCSV形式のみで出力してください（ヘッダー不要）。
発売予定日(YYYY/MM/DD),優先度(High/Mid),カテゴリ,eBay検索用キーワード(英語)

例: 2026/06/15,High,Watch,G-SHOCK MRG-BF1000E-1A9JR Limited
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = { "contents": [{ "parts": [{ "text": prompt }] }] };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());

    if (json.candidates && json.candidates.length > 0) {
      let csvData = json.candidates[0].content.parts[0].text;
      csvData = csvData.replace(new RegExp("```csv", "gi"), "").replace(new RegExp("```", "g"), "").trim();

      const lines = csvData.split('\n');
      let addedCount = 0;

      lines.forEach(line => {
        if (!line.trim()) return;

        const parts = line.split(',');
        if (parts.length >= 4) {
          const date = parts[0].trim();
          const priority = parts[1].trim();
          const category = parts[2].trim();
          const keyword = parts[3].trim();

          if (keyword && !isAlreadyInLedger(sheet, keyword)) {
            const dutyFree = (category.toLowerCase().includes('watch') || category.toLowerCase().includes('hobby') || category.toLowerCase().includes('figure') || category.toLowerCase().includes('card')) ? "TRUE" : "FALSE";
            sheet.appendRow([date, priority, category, keyword, dutyFree, "ACTIVE", "", ""]);
            Logger.log(`[New Asset Found] ${keyword} を台帳に追加しました。`);
            addedCount++;
          }
        }
      });
      Logger.log(`[Discovery] ${addedCount} 件の新規アセットを台帳に追加完了しました。`);
    } else {
      Logger.log(`[Discovery Error] Geminiからの適切な応答がありませんでした。`);
    }
  } catch (e) {
    Logger.log(`[Discovery Error] 例外発生: ${e.message}`);
  }
}

function isAlreadyInLedger(sheet, keyword) {
  const data = sheet.getDataRange().getValues();
  const targetKeyword = keyword.toString().toLowerCase().trim();
  return data.some(row => {
    const currentCell = (row[3] || "").toString().toLowerCase().trim();
    return currentCell === targetKeyword;
  });
}

// ==========================================
// 2. メイン・オーケストレーター
// ==========================================
function runResearchEngine() {
  if (!SPREADSHEET_ID) throw new Error("[System Error] SPREADSHEET_ID が設定されていません。");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ledgerSheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  const masterSheet = ss.getSheetByName(MASTER_SHEET_NAME);

  if (!ledgerSheet || !masterSheet) throw new Error(`[System Error] シートが見つかりません。`);

  const ebayToken = getEbayOAuthToken();
  if (!ebayToken) {
    Logger.log("[System Error] eBayトークンの取得に失敗。");
    return;
  }

  const data = ledgerSheet.getDataRange().getValues();
  const headers = data[0];

  // 台帳シートのヘッダー名に柔軟に対応するトリプル・フォールバック
  let colKeyword = headers.indexOf('Keyword');
  if (colKeyword === -1) colKeyword = headers.indexOf('Search_Keyword');
  if (colKeyword === -1) colKeyword = headers.indexOf('Asset_Keyword');
  if (colKeyword === -1) colKeyword = 3; // すべて見つからない場合は初期設計の4列目(インデックス3)を強制指定

  const colStatus = headers.indexOf('Status');
  const colLastSearched = headers.indexOf('Last_Searched');

  const todayStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy/MM/dd");

  for (let i = 1; i < data.length; i++) {
    let status = data[i][colStatus];
    // 数値型のキーワードが紛れ込んでも完全に文字列として処理
    let keyword = (data[i][colKeyword] || "").toString().trim();
    let lastSearchedStr = data[i][colLastSearched] ? Utilities.formatDate(new Date(data[i][colLastSearched]), "GMT+9", "yyyy/MM/dd") : "";

    if (status === 'ACTIVE' && lastSearchedStr !== todayStr) {
      Logger.log(`[Target Lock] 検索開始: ${keyword}`);
      let rawItems = searchEbayBrowseAPI(keyword, ebayToken);

      if (rawItems && rawItems.length > 0) {
        let safeItems = applyDefenseFilters(rawItems);
        if (safeItems.length > 0) {
          Logger.log(`[Bingo] 候補発見。AI要約を生成します。`);

          if (GEMINI_API_KEY) {
            const targetItem = safeItems[0];
            const rawItemId = targetItem.itemId.split('|')[1] || targetItem.itemId;
            const priceUsd = targetItem.price ? parseFloat(targetItem.price.value) : 0;
            const itemUrl = `${HUB_SITE_URL}?item=${rawItemId}&c=${EBAY_CAMPAIGN_ID}`;

            let aiSummary = generateAISummary(targetItem, keyword);
            Utilities.sleep(15000); // 5RPMレートリミット対策

            if (aiSummary) {
              const currentTimeStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy/MM/dd HH:mm:ss");

              // 【厳格配置】指定された7大カラムヘッダー順序 [A:Asset_Keyword, B:eBay_Item_ID, C:Item_Title, D:Price_USD, E:Affiliate_URL, F:AI_Summary, G:Last_Updated] に完全固定
              masterSheet.appendRow([
                keyword,          // A列
                rawItemId,        // B列
                targetItem.title, // C列
                priceUsd,         // D列
                itemUrl,          // E列
                aiSummary,        // F列
                currentTimeStr    // G列
              ]);

              ledgerSheet.getRange(i + 1, colStatus + 1).setValue('COMPLETED');
              Logger.log(`[Success] Master_Data への転記および台帳のステータス更新が完了しました。`);
            }
          }
        }
      }
      ledgerSheet.getRange(i + 1, colLastSearched + 1).setValue(todayStr);
      break;
    }
  }
}

// ==========================================
// 3. eBay API & フィルタモジュール
// ==========================================
function getEbayOAuthToken() {
  const credentials = Utilities.base64Encode(EBAY_APP_ID + ':' + EBAY_CERT_ID);
  const url = 'https://api.ebay.com/identity/v1/oauth2/token';

  const options = {
    'method': 'post',
    'headers': { 'Authorization': 'Basic ' + credentials, 'Content-Type': 'application/x-www-form-urlencoded' },
    'payload': 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText()).access_token || null;
  } catch (e) { return null; }
}

function searchEbayBrowseAPI(keyword, token) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=50&filter=itemLocationCountry:!CN`;

  const options = {
    'method': 'get',
    'headers': { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText()).itemSummaries || [];
  } catch (e) { return []; }
}

function applyDefenseFilters(items) {
  const negativeKeywords = ['food', 'drink', 'supplement', 'medicine', 'cosmetic', 'perfume', 'ticket', 'coupon', 'gift card', 'shoes', 'leather', 'empty', 'box only', 'reprint', 'photo only', 'digital'];
  return items.filter(item => {
    let title = (item.title || "").toLowerCase();
    if (negativeKeywords.some(ng => title.includes(ng))) return false;
    let condition = (item.condition || "used").toLowerCase();
    if (!condition.includes('new') && item.conditionId !== "1000") return false;
    let seller = item.seller || {};
    let feedbackScore = parseInt(seller.feedbackScore, 10) || 0;
    let positivePercent = parseFloat(seller.feedbackPercentage) || 0.0;
    if (feedbackScore < 100 || positivePercent < 98.5) return false;
    return true;
  });
}

// ==========================================
// 4. Gemini 記事生成エンジン
// ==========================================
function generateAISummary(safeItem, keyword) {
  const originalTitle = safeItem.title || "";
  const priceUsd = safeItem.price ? parseFloat(safeItem.price.value) : 0;
  if (!GEMINI_API_KEY) return "";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `
You are a data provider for an AI agent. Create a concise, factual summary (under 140 characters) of the following item in English.
Focus on specifications, rarity, and objective value for collectors or investors. Do not use promotional language.
【Data】
- Keyword: ${keyword}
- Title: ${originalTitle}
- Price: $${priceUsd}
Output ONLY the summary text. No markdown, no json.
`;

  const payload = { "contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3} };
  const options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates.length > 0) return json.candidates[0].content.parts[0].text.trim();
    return "";
  } catch (e) { return ""; }
}

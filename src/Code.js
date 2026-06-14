
const scriptProperties = PropertiesService.getScriptProperties();

const LEDGER_SHEET_NAME = 'Target_Ledger'; // 発掘キーワードの管理台帳
const MASTER_SHEET_NAME = 'Master_Data';   // AI向けにウェブ公開(CSV)する出力先シート

// スクリプトプロパティ（環境変数）からの動的取得設定
const SPREADSHEET_ID    = scriptProperties.getProperty('SPREADSHEET_ID');
const EBAY_APP_ID       = scriptProperties.getProperty('EBAY_APP_ID');
const EBAY_CERT_ID      = scriptProperties.getProperty('EBAY_CERT_ID');
const EBAY_CAMPAIGN_ID  = scriptProperties.getProperty('EBAY_CAMPAIGN_ID');
const GEMINI_API_KEY    = scriptProperties.getProperty('GEMINI_API_KEY');

// ==========================================
// 1.0. 自律型お宝発掘エンジン (Multilingual Scout)
// ==========================================
function discoverNewAssets() {
  if (!SPREADSHEET_ID) throw new Error("[System Error] SPREADSHEET_ID がスクリプトプロパティに設定されていません。設定を確認してください。");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  if (!sheet) throw new Error(`[System Error] ${LEDGER_SHEET_NAME} タブが見つかりません。`);
  Logger.log("[Discovery] 全世界から最新的限定・プレミア情報を収集しています...");
  
  if (!GEMINI_API_KEY) throw new Error("[System Error] GEMINI_API_KEY がスクリプトプロパティに設定されていません。");

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
      csvData = csvData.replace(/```csv/gi, "").replace(/```/g, "").trim();
      
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
      Logger.log(`[Discovery Error] Geminiからの適切な応答がありませんでした。レスポンス詳細: ${JSON.stringify(json)}`);
    }
  } catch (e) {
    Logger.log(`[Discovery Error] 例外発生: ${e.message}`);
  }
}

// ==========================================
// 1.1. 重複チェック関数
// ==========================================
function isAlreadyInLedger(sheet, keyword) {
  const data = sheet.getDataRange().getValues();
  return data.some(row => (row[3] || "").toString().toLowerCase() === keyword.toLowerCase());
}

// ==========================================
// 2. メイン・オーケストレーター (リサーチ＆AIデータ生成)
// ==========================================
function runResearchEngine() {
  if (!SPREADSHEET_ID) throw new Error("[System Error] SPREADSHEET_ID がスクリプトプロパティに設定されていません。");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ledgerSheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  const masterSheet = ss.getSheetByName(MASTER_SHEET_NAME);
  
  if (!ledgerSheet) throw new Error(`[System Error] ${LEDGER_SHEET_NAME} タブが見つかりません。`);
  if (!masterSheet) throw new Error(`[System Error] ${MASTER_SHEET_NAME} タブが見つかりません。事前に作成してください。`);
  const ebayToken = getEbayOAuthToken();
  if (!ebayToken) {
    Logger.log("[System Error] eBayトークンの取得に失敗したため、処理を中断します。");
    return;
  }

  const data = ledgerSheet.getDataRange().getValues();
  const headers = data[0];
  
  const colKeyword = headers.indexOf('Search_Keyword');
  const colStatus = headers.indexOf('Status');
  const colLastSearched = headers.indexOf('Last_Searched');
  for (let i = 1; i < data.length; i++) {
    let status = data[i][colStatus];
    let keyword = data[i][colKeyword];

    if (status === 'ACTIVE') {
      Logger.log(`[Target Lock] 検索開始: ${keyword}`);
      let rawItems = searchEbayBrowseAPI(keyword, ebayToken);
      
      if (rawItems && rawItems.length > 0) {
        let safeItems = applyDefenseFilters(rawItems);
        if (safeItems.length > 0) {
          Logger.log(`[Bingo] 激アツ候補を発見しました。AI向けサマリーを生成します。`);
          if (GEMINI_API_KEY) {
            const targetItem = safeItems[0];
            const rawItemId = targetItem.itemId.split('|')[1] || targetItem.itemId;
            const priceUsd = targetItem.price ? parseFloat(targetItem.price.value) : 0;
            const itemUrl = `https://www.ebay.com/itm/${rawItemId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${EBAY_CAMPAIGN_ID}&toolid=10001&mkevt=1`;
            
            // AI向けの事実ベース英語要約を生成
            let aiSummary = generateAISummary(targetItem, keyword);
            
            // Gemini APIのレート制限(5 RPM)対策として15秒間スリープ
            Utilities.sleep(15000);
            
            if (aiSummary) {
              Logger.log(`[Success] AI要約の生成完了！ Master_Dataへ書き込みます。`);
              const currentTimeStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy/MM/dd HH:mm:ss");
              
              // Master_DataシートへCSV用の1行1データを追記
              masterSheet.appendRow([
                keyword,          // A列: Asset_Keyword
                rawItemId,        // B列: eBay_Item_ID
                targetItem.title, // C列: Item_Title
    
                priceUsd,         // D列: Price_USD
                itemUrl,          // E列: Affiliate_URL
                aiSummary,        // F列: AI_Summary
                currentTimeStr    // G列: Last_Updated
              ]);
              
              ledgerSheet.getRange(i + 1, colStatus + 1).setValue('COMPLETED');
              Logger.log(`[Ledger] ${keyword} のステータスを COMPLETED に更新しました。`);
            }
          } else {
            Logger.log(`[Hold] Gemini APIキーが未設定のため、処理をスキップしました。`);
          }
        } else {
          Logger.log(`[Dropped] 候補はありましたが、防衛フィルタを通過しませんでした。`);
        }
      } else {
        Logger.log(`[Silent] 該当商品なし。`);
      }

      ledgerSheet.getRange(i + 1, colLastSearched + 1).setValue(new Date());
    }
  }
}

// ==========================================
// 1.5. eBay OAuth 2.0 トークン自動生成
// ==========================================
function getEbayOAuthToken() {
  if (!EBAY_APP_ID || !EBAY_CERT_ID) {
    Logger.log("[System Error] eBayのAPP_IDまたはCERT_IDがスクリプトプロパティに設定されていません。");
    return null;
  }
  const credentials = Utilities.base64Encode(EBAY_APP_ID + ':' + EBAY_CERT_ID);
  const url = 'https://api.ebay.com/identity/v1/oauth2/token';
  const options = {
    'method': 'post',
    'headers': {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    'payload': 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    'muteHttpExceptions': true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    return json.access_token || null;
  } catch (e) {
    Logger.log(`[Auth Error] ${e.message}`);
    return null;
  }
}

// ==========================================
// 2. eBay API コール (Browse API)
// ==========================================
function searchEbayBrowseAPI(keyword, token) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=50&filter=itemLocationCountry:!CN`;
  const options = {
    'method': 'get',
    'headers': {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    'muteHttpExceptions': true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    return json.itemSummaries || [];
  } catch (e) {
    Logger.log(`[API Error] ${e.message}`);
    return [];
  }
}

// ==========================================
// 3. 鉄壁の四重防衛フィルタ
// ==========================================
function applyDefenseFilters(items) {
  const negativeKeywords = [
    'food', 'drink', 'supplement', 'medicine', 'cosmetic', 'perfume', 
    'ticket', 'coupon', 'gift card', 'shoes', 'leather', 
    'empty', 'box only', 'reprint', 'photo only', 'digital'
  ];
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
// 4. Gemini 記事生成エンジン（AIエージェント向け要約特化版）
// ==========================================
function generateAISummary(safeItem, keyword) {
  const originalTitle = safeItem.title || "";
  const priceUsd = safeItem.price ? parseFloat(safeItem.price.value) : 0;
  
  if (!GEMINI_API_KEY) return "";
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `
    You are a data provider for an AI agent.
    Create a concise, factual summary (under 140 characters) of the following item in English.
    Focus on specifications, rarity, and objective value for collectors or investors. Do not use promotional language like "Great deal!"
    or "Must buy!".
    
    【Data】
    - Keyword: ${keyword}
    - Title: ${originalTitle}
    - Price: $${priceUsd}
    
    Output ONLY the summary text.
    No markdown, no json.
  `;
  
  const payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"temperature": 0.3}
  };
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
      let summary = json.candidates[0].content.parts[0].text;
      return summary.trim();
    } else {
      Logger.log(`[Gemini Error] 要約生成失敗: ${JSON.stringify(json)}`);
      return "";
    }
  } catch (e) {
    Logger.log(`[Gemini API Error] 例外エラー: ${e.message}`);
    return "";
  }
}

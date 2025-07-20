// threads-api-local.js - 本地版本的 Threads API 處理程式
const fs = require('fs').promises;
const path = require('path');

// Google Secret Manager 相關
let secretManagerClient = null;
let secretManagerService = null;

// Google Sheets 和 Drive 相關
let sheetsService = null;
let driveService = null;
let runService = null;
let google = null;

// 嘗試載入 Google Cloud 相關模組
try {
  const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
  secretManagerClient = new SecretManagerServiceClient();
  secretManagerService = require('@google-cloud/secret-manager');
} catch (error) {
  console.log('Google Secret Manager 模組未安裝，將使用本地檔案儲存');
}

// 嘗試載入 Google APIs
try {
  const googleapis = require('googleapis');
  google = googleapis.google;
  sheetsService = google.sheets({version: 'v4'});
  driveService = google.drive({version: 'v3'});
  runService = google.run({version: 'v2'});
} catch (error) {
  console.log('Google APIs 模組未安裝');
}

class ThreadsAPILocal {
  constructor() {
    // 在 Docker 容器中使用 /app/data 目錄
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    this.configFile = path.join(dataDir, 'config.json');
    
    // Google Secret Manager 設定
    this.secretName = process.env.SECRET_NAME || 'threads-access-token';
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    
    // Google Sheets 設定
    this.spreadsheetId = process.env.SPREADSHEET_ID;
    // 修正工作表名稱，移除特殊字符和空格
    this.sheetName = process.env.SHEET_NAME || 'ThreadsData';
    

    
    // 確保資料目錄存在
    this.ensureDataDir(dataDir);
  }

  // 確保資料目錄存在
  async ensureDataDir(dataDir) {
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      console.log('資料目錄已存在或無法創建:', error.message);
    }
  }

  // 從 Google Secret Manager 取得 access token
  async getAccessTokenFromSecretManager() {
    if (!secretManagerClient || !this.projectId) {
      console.log('Google Secret Manager 未設定，使用本地檔案');
      return null;
    }

    try {
      const name = `projects/${this.projectId}/secrets/${this.secretName}/versions/latest`;
      const [version] = await secretManagerClient.accessSecretVersion({name});
      const accessToken = version.payload.data.toString();
      
      console.log('從 Google Secret Manager 取得 access token');
      console.log('Token 開頭:', accessToken.substring(0, 10) + '...' + accessToken.substring(accessToken.length - 10));
      
      return accessToken;
    } catch (error) {
      console.log('從 Google Secret Manager 取得 access token 失敗:', error.message);
      return null;
    }
  }

  // 設定 access token（支援本地檔案和 Google Secret Manager）
  async setAccessToken(accessToken, useSecretManager = false) {
    if (useSecretManager && secretManagerClient && this.projectId) {
      try {
        const parent = `projects/${this.projectId}`;
        const secretId = this.secretName;
        
        // 檢查 secret 是否存在，不存在則創建
        try {
          await secretManagerClient.getSecret({name: `${parent}/secrets/${secretId}`});
        } catch (error) {
          if (error.code === 5) { // NOT_FOUND
            await secretManagerClient.createSecret({
              parent: parent,
              secretId: secretId,
              secret: {
                replication: {
                  automatic: {},
                },
              },
            });
            console.log(`Secret ${secretId} 已創建`);
          } else {
            throw error;
          }
        }
        
        // 添加新版本
        await secretManagerClient.addSecretVersion({
          parent: `${parent}/secrets/${secretId}`,
          payload: {
            data: Buffer.from(accessToken, 'utf8'),
          },
        });
        
        console.log('Access token 已成功儲存到 Google Secret Manager');
        return true;
      } catch (error) {
        console.error('儲存 access token 到 Google Secret Manager 失敗:', error);
        return false;
      }
    } else {
      // 使用本地檔案儲存
      try {
        const config = { THREADS_ACCESS_TOKEN: accessToken };
        await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
        console.log('Access token 已成功儲存到本地設定檔');
        return true;
      } catch (error) {
        console.error('儲存 access token 失敗:', error);
        return false;
      }
    }
  }

  // 取得已儲存的 access token
  async getStoredAccessToken() {
    // 優先從 Google Secret Manager 取得
    const secretManagerToken = await this.getAccessTokenFromSecretManager();
    if (secretManagerToken) {
      return secretManagerToken;
    }
    
    // 如果 Secret Manager 失敗，嘗試從本地檔案取得
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(configData);
      const accessToken = config.THREADS_ACCESS_TOKEN;
      
      if (accessToken) {
        console.log('Access token 已存在（本地檔案）');
        console.log('Token 開頭:', accessToken.substring(0, 10) + '...' + accessToken.substring(accessToken.length - 10));
        return accessToken;
      } else {
        console.log('找不到 Access token，請先執行 setAccessToken()');
        return null;
      }
    } catch (error) {
      console.log('找不到設定檔，請先執行 setAccessToken()');
      return null;
    }
  }

  // 延遲函數
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 取得上一次 Cloud Scheduler 執行時間
  async getLastSchedulerExecutionTime() {
    try {
      const {exec} = require('child_process');
      const {promisify} = require('util');
      const execAsync = promisify(exec);
      
      const command = `gcloud scheduler jobs describe threads-insights-scheduler-trigger --location=asia-east1 --format="value(lastAttemptTime)"`;
      console.log('正在查詢 Cloud Scheduler:', command);
      
      const {stdout} = await execAsync(command);
      
      const lastAttemptTime = stdout.trim();
      if (lastAttemptTime && lastAttemptTime !== 'None') {
        console.log(`上一次排程執行時間: ${lastAttemptTime}`);
        
        return lastAttemptTime; // 返回完整的 ISO 8601 時間戳
      } else {
        console.log('沒有找到上次執行時間');
        return null;
      }
    } catch (error) {
      console.log('取得上一次排程執行時間失敗:', error.message);
      return null;
    }
  }

  // 取得當前時間（YYYY-MM-DD 格式）
  getCurrentDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }



  // 取得所有貼文（排除 REPOST_FACADE）
  async getAllTextPosts(since = null, until = null) {
    const accessToken = await this.getStoredAccessToken();
    
    if (!accessToken) {
      console.error('找不到 Access Token，請先執行 setAccessToken()');
      return null;
    }

    // 如果沒有指定 since，嘗試取得上次執行時間作為參考
    let lastExecutionTime = null;
    if (!since) {
      lastExecutionTime = await this.getLastSchedulerExecutionTime();
      if (lastExecutionTime) {
        console.log(`使用上次執行時間作為參考: ${lastExecutionTime}`);
      }
    }

    let allTextPosts = [];
    let baseUrl = `https://graph.threads.net/v1.0/me/threads?fields=id,media_type,media_url,permalink,timestamp,text`;
    
    // 添加日期範圍參數
    if (since) {
      baseUrl += `&since=${since}`;
    }
    if (until) {
      baseUrl += `&until=${until}`;
    }
    
    baseUrl += `&access_token=${accessToken}`;
    let nextUrl = baseUrl;
    let pageCount = 0;

    try {
      while (nextUrl) {
        pageCount++;
        console.log(`正在抓取第 ${pageCount} 頁...`);
        
        const response = await fetch(nextUrl);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(`API 請求失敗: ${response.status} - ${JSON.stringify(data)}`);
        }
        
        // 過濾出除了 REPOST_FACADE 之外的所有貼文
        let filteredPosts = data.data ? data.data.filter(post => post.media_type !== 'REPOST_FACADE') : [];
        
        // 如果有上次執行時間，進一步過濾掉相同或更早 timestamp 的貼文
        if (lastExecutionTime && filteredPosts.length > 0) {
          const originalCount = filteredPosts.length;
          const lastExecutionTimestamp = new Date(lastExecutionTime).getTime();
          
          filteredPosts = filteredPosts.filter(post => {
            const postTimestamp = new Date(post.timestamp).getTime();
            const isNewer = postTimestamp > lastExecutionTimestamp;
            if (!isNewer) {
              console.log(`跳過較早或相同時間的貼文: ${post.id} (${post.timestamp})`);
            }
            return isNewer;
          });
          console.log(`過濾掉 ${originalCount - filteredPosts.length} 則較早或相同時間的貼文`);
        }
        
        // 將這一頁的貼文加入總陣列
        allTextPosts = allTextPosts.concat(filteredPosts);
        
        console.log(`第 ${pageCount} 頁找到 ${filteredPosts.length} 則貼文（排除 REPOST_FACADE）`);
        console.log(`目前總共 ${allTextPosts.length} 則貼文`);
        
        // 檢查是否有下一頁
        nextUrl = data.paging && data.paging.next ? data.paging.next : null;
        
        // 添加延遲避免 API 限制
        if (nextUrl) {
          await this.sleep(500);
        }
      }
      
      console.log(`抓取完成！總共 ${pageCount} 頁，${allTextPosts.length} 則貼文（排除 REPOST_FACADE）`);
      if (since || until) {
        console.log(`日期範圍: ${since || '無限制'} 到 ${until || '無限制'}`);
      }
      
      // 按照 timestamp 排序（最新的在前）
      allTextPosts.sort((a, b) => {
        const timestampA = new Date(a.timestamp).getTime();
        const timestampB = new Date(b.timestamp).getTime();
        return timestampB - timestampA; // 降序排列，最新的在前
      });
      
      console.log('已按照時間戳排序（最新的在前）');
      
      // 建立 id: permalink 的對應物件
      const idPermalinkMap = {};
      allTextPosts.forEach(post => {
        idPermalinkMap[post.id] = post.permalink;
      });
      
      return {
        posts: allTextPosts,
        idPermalinkMap: idPermalinkMap,
        totalCount: allTextPosts.length
      };
      
    } catch (error) {
      console.error('錯誤:', error);
      console.log(`已抓取 ${allTextPosts.length} 則貼文（在錯誤發生前）`);
      
      // 即使發生錯誤也建立已抓取資料的對應
      const idPermalinkMap = {};
      allTextPosts.forEach(post => {
        idPermalinkMap[post.id] = post.permalink;
      });
      
      return {
        posts: allTextPosts,
        idPermalinkMap: idPermalinkMap,
        totalCount: allTextPosts.length
      };
    }
  }

  // 取得貼文洞察資料
  async getThreadInsights(threadId) {
    const accessToken = await this.getStoredAccessToken();
    
    if (!accessToken) {
      console.error('找不到 Access Token，請先執行 setAccessToken()');
      return null;
    }
    
    const url = `https://graph.threads.net/v1.0/${threadId}/insights?metric=views%2C%20likes%2C%20replies%2C%20reposts%2C%20quotes%2C%20shares&access_token=${accessToken}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`API 請求失敗: ${response.status} - ${JSON.stringify(data)}`);
      }
      
      // 解析並取得實際數值
      const insights = {};
      
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach(item => {
          const metricName = item.name;
          const metricValue = item.values && item.values[0] ? item.values[0].value : 0;
          insights[metricName] = metricValue;
        });
      }
      
      return insights;
      
    } catch (error) {
      console.error(`取得 ${threadId} 的洞察資料時發生錯誤:`, error);
      return null;
    }
  }

  // 取得所有貼文並包含洞察資料（分批處理版本）
  async getAllTextPostsWithInsights(since = null, until = null) {
    console.log('開始取得所有貼文（排除 REPOST_FACADE）...');
    if (since || until) {
      console.log(`日期範圍: ${since || '無限制'} 到 ${until || '無限制'}`);
    }
    
    // 先取得所有貼文
    const postsResult = await this.getAllTextPosts(since, until);
    
    if (!postsResult || !postsResult.idPermalinkMap || !postsResult.posts) {
      console.error('無法取得貼文資料');
      return null;
    }
    
    const { idPermalinkMap, posts } = postsResult;
    const threadIds = Object.keys(idPermalinkMap);
    
    // 檢查是否有新資料需要處理
    if (threadIds.length === 0) {
      console.log('沒有新的貼文需要處理，直接結束');
      return {};
    }
    
    // 建立貼文資料對應（包含 text）
    const postsDataMap = {};
    posts.forEach(post => {
      // 提取第一行文字（到 \n 為止）
      let firstLineText = '';
      if (post.text) {
        const firstNewlineIndex = post.text.indexOf('\n');
        firstLineText = firstNewlineIndex !== -1 ? post.text.substring(0, firstNewlineIndex) : post.text;
      }
      
      postsDataMap[post.id] = {
        permalink: post.permalink,
        text: firstLineText
      };
    });
    
    console.log(`找到 ${threadIds.length} 則新貼文，開始分批取得洞察資料...`);
    
    const allInsights = {};
    let processedCount = 0;
    const batchSize = 10; // 每 10 行更新一次
    
    // 遍歷每個貼文 ID 取得洞察資料
    for (const threadId of threadIds) {
      processedCount++;
      
      console.log(`正在處理第 ${processedCount}/${threadIds.length} 則貼文: ${threadId}`);
      
      const insights = await this.getThreadInsights(threadId);
      const postData = postsDataMap[threadId];
      
      if (insights) {
        allInsights[threadId] = {
          id: threadId,
          permalink: postData.permalink,
          text: postData.text,
          stats: insights
        };
      } else {
        // 即使取得洞察資料失敗，也保留基本資訊
        allInsights[threadId] = {
          id: threadId,
          permalink: postData.permalink,
          text: postData.text,
          stats: null
        };
      }
      
      // 每處理 10 行就更新一次 Google Sheets
      if (processedCount % batchSize === 0 || processedCount === threadIds.length) {
        console.log(`已處理 ${processedCount} 則貼文，正在更新 Google Sheets...`);
        
        // 將當前已處理的資料傳遞給回調函數
        if (this.onBatchProcessed) {
          await this.onBatchProcessed(allInsights, processedCount, threadIds.length);
        }
      }
      
      // 添加延遲避免 API 限制
      if (processedCount < threadIds.length) {
        await this.sleep(500);
      }
    }
    
    console.log('處理完成！');
    return allInsights;
  }

  // 取得 Google APIs 認證
  async getGoogleAuth() {
    if (!google) {
      console.error('Google APIs 未安裝');
      return null;
    }

    try {
      let auth;
      
      // 從 Secret Manager 取得服務帳戶金鑰
      if (secretManagerClient && this.projectId) {
        try {
          const name = `projects/${this.projectId}/secrets/google-sheets-key/versions/latest`;
          const [version] = await secretManagerClient.accessSecretVersion({name});
          const keyData = JSON.parse(version.payload.data.toString());
          
          auth = new google.auth.GoogleAuth({
            credentials: keyData,
            scopes: [
              'https://www.googleapis.com/auth/spreadsheets',
              'https://www.googleapis.com/auth/drive',
              'https://www.googleapis.com/auth/drive.file'
            ],
          });
          console.log('使用 Secret Manager 中的服務帳戶金鑰');
        } catch (error) {
          console.log('無法從 Secret Manager 取得金鑰，使用應用程式預設認證');
          auth = new google.auth.GoogleAuth({
            scopes: [
              'https://www.googleapis.com/auth/spreadsheets',
              'https://www.googleapis.com/auth/drive',
              'https://www.googleapis.com/auth/drive.file'
            ],
          });
        }
      } else {
        // 使用應用程式預設認證（Cloud 環境）
        auth = new google.auth.GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file'
          ],
        });
        console.log('使用應用程式預設認證');
      }
      
      return await auth.getClient();
    } catch (error) {
      console.error('取得 Google APIs 認證失敗:', error);
      return null;
    }
  }





  // 工作表名稱安全處理
  escapeSheetName(sheetName) {
    // 如果工作表名稱包含空格、特殊字符或中文，需要用單引號包圍
    if (/[^A-Za-z0-9_]/.test(sheetName)) {
      return `'${sheetName.replace(/'/g, "''")}'`;
    }
    return sheetName;
  }



  // 格式化試算表（修正版本）
  async formatSpreadsheet(spreadsheetId, sheetName, auth, dataRowsCount) {
    try {
      // 先獲取試算表的詳細資訊，包括工作表 ID
      const spreadsheet = await sheetsService.spreadsheets.get({
        auth: auth,
        spreadsheetId: spreadsheetId,
        ranges: [sheetName],
        fields: 'sheets.properties'
      });

      // 找到對應的工作表 ID
      let targetSheetId = null;
      if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
        for (const sheet of spreadsheet.data.sheets) {
          if (sheet.properties && sheet.properties.title === sheetName) {
            targetSheetId = sheet.properties.sheetId;
            break;
          }
        }
      }

      if (targetSheetId === null) {
        console.log('無法找到工作表 ID，跳過格式化');
        return;
      }

      console.log(`找到工作表 ID: ${targetSheetId}`);

      // 設定標題列格式
      const headerFormatRequest = {
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 8 // 8 個欄位
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.26,
                green: 0.52,
                blue: 0.96
              },
              textFormat: {
                bold: true,
                foregroundColor: {
                  red: 1,
                  green: 1,
                  blue: 1
                }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      };

      // 設定數字格式（統計欄位）
      const numberFormatRequests = [];
      const statsColumns = [2, 3, 4, 5, 6, 7]; // Views, Likes, Replies, Reposts, Quotes, Shares (0-based)
      
      statsColumns.forEach(colIndex => {
        numberFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: targetSheetId,
              startRowIndex: 1,
              endRowIndex: dataRowsCount + 1,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'NUMBER',
                  pattern: '#,##0'
                }
              }
            },
            fields: 'userEnteredFormat.numberFormat'
          }
        });
      });

      // 自動調整欄寬
      const autoResizeRequests = [];
      for (let i = 0; i < 8; i++) {
        autoResizeRequests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId: targetSheetId,
              dimension: 'COLUMNS',
              startIndex: i,
              endIndex: i + 1
            }
          }
        });
      }

      // 凍結標題列
      const freezeRequest = {
        updateSheetProperties: {
          properties: {
            sheetId: targetSheetId,
            gridProperties: {
              frozenRowCount: 1
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      };

      // 執行所有格式化請求
      const requests = [headerFormatRequest, freezeRequest, ...numberFormatRequests, ...autoResizeRequests];
      
      await sheetsService.spreadsheets.batchUpdate({
        auth: auth,
        spreadsheetId: spreadsheetId,
        resource: {
          requests: requests
        }
      });

      console.log('試算表格式化完成');

    } catch (error) {
      console.error('格式化試算表時發生錯誤:', error);
      // 格式化失敗不影響主要功能
    }
  }

    // 儲存到試算表（分批更新版本）
  async saveToSheet(spreadsheetId, sheetName = 'Threads 資料', since = null, until = null) {
    console.log('開始取得資料並分批儲存到 Google Sheets...');
    if (since || until) {
      console.log(`日期範圍: ${since || '無限制'} 到 ${until || '無限制'}`);
    }
    
    if (!sheetsService) {
      console.log('Google Sheets API 未安裝，無法儲存到 Google Sheets');
      return null;
    }

    try {
      const auth = await this.getGoogleAuth();
      if (!auth) {
        console.error('無法取得 Google APIs 認證');
        return null;
      }

      // 檢查試算表是否存在
      try {
        await sheetsService.spreadsheets.get({
          auth: auth,
          spreadsheetId: spreadsheetId
        });
      } catch (error) {
        console.error(`試算表 ${spreadsheetId} 不存在或無法存取`);
        return null;
      }

      // 安全處理工作表名稱
      const safeSheetName = this.escapeSheetName(sheetName);
      console.log(`使用工作表名稱: ${safeSheetName}`);

      // 檢查工作表是否存在，不存在則建立
      try {
        // 嘗試讀取工作表以檢查是否存在
        await sheetsService.spreadsheets.values.get({
          auth: auth,
          spreadsheetId: spreadsheetId,
          range: `${safeSheetName}!A1`
        });
        console.log(`工作表 ${sheetName} 已存在`);
      } catch (error) {
        // 工作表不存在，建立新工作表
        console.log(`工作表 ${sheetName} 不存在，正在建立...`);
        await sheetsService.spreadsheets.batchUpdate({
          auth: auth,
          spreadsheetId: spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName
                }
              }
            }]
          }
        });
        console.log(`工作表 ${sheetName} 已建立`);
      }

      // 準備標題行
      const headers = [
        'Text (第一行)',
        'Permalink',
        'Views',
        'Likes',
        'Replies',
        'Reposts',
        'Quotes',
        'Shares'
      ];

      // 先寫入標題行
      await sheetsService.spreadsheets.values.update({
        auth: auth,
        spreadsheetId: spreadsheetId,
        range: `${safeSheetName}!A1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });

      console.log('標題行已寫入');

      console.log('準備新增資料到試算表最上方（最新的在前）');

      // 設定分批處理回調函數
      this.onBatchProcessed = async (allInsights, processedCount, totalCount) => {
        try {
          // 準備所有資料行
          const rows = [];
          Object.values(allInsights).forEach(post => {
            const stats = post.stats || {};
            const row = [
              post.text || '',
              post.permalink,
              stats.views || 0,
              stats.likes || 0,
              stats.replies || 0,
              stats.reposts || 0,
              stats.quotes || 0,
              stats.shares || 0
            ];
            rows.push(row);
          });

          if (rows.length === 0) {
            console.log(`批次處理完成: ${processedCount}/${totalCount} 則貼文，沒有資料需要新增`);
            return;
          }

          // 將新資料插入到第二行（標題行下方）
          if (rows.length > 0) {
            const writeResponse = await sheetsService.spreadsheets.values.update({
              auth: auth,
              spreadsheetId: spreadsheetId,
              range: `${safeSheetName}!A2`,
              valueInputOption: 'RAW',
              resource: {
                values: rows
              }
            });

            console.log(`批次更新完成: ${processedCount}/${totalCount} 則貼文，新增了 ${writeResponse.data.updatedRows} 行新資料到最上方`);
          }

          // 最後一次更新時進行格式化
          if (processedCount === totalCount) {
            console.log('進行最終格式化...');
            await this.formatSpreadsheet(spreadsheetId, safeSheetName, auth, Object.keys(allInsights).length);
          }

        } catch (error) {
          console.error('批次更新時發生錯誤:', error);
        }
      };

      // 開始取得所有貼文資料（會觸發分批更新）
      const allInsights = await this.getAllTextPostsWithInsights(since, until);
      
      if (!allInsights) {
        console.error('無法取得貼文資料');
        return null;
      }

      // 檢查是否有新資料
      const insightsCount = Object.keys(allInsights).length;
      if (insightsCount === 0) {
        console.log('沒有新資料需要更新，直接結束');
        return {
          spreadsheetId: spreadsheetId,
          sheetName: sheetName,
          totalPosts: 0,
          url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
          updatedRows: 0
        };
      }

      console.log(`資料已成功儲存到 Google Sheets: ${spreadsheetId}`);
      console.log(`工作表名稱: ${sheetName}`);
      console.log(`總共儲存了 ${insightsCount} 則貼文資料`);

      return {
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        totalPosts: insightsCount,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        updatedRows: insightsCount
      };

    } catch (error) {
      console.error('儲存到試算表時發生錯誤:', error);
      console.error('錯誤詳情:', error.message);
      return null;
    }
  }
}

// 使用範例
async function main() {
  const threadsAPI = new ThreadsAPILocal();
  
  // 檢查是否有儲存的 token
  const token = await threadsAPI.getStoredAccessToken();
  if (!token) {
    console.log('請先設定 access token:');
    console.log('await threadsAPI.setAccessToken("你的_access_token");');
    return;
  }
  
  // 檢查是否有設定 SPREADSHEET_ID
  if (!process.env.SPREADSHEET_ID) {
    console.error('請設定 SPREADSHEET_ID 環境變數');
    console.log('範例: SPREADSHEET_ID=your_spreadsheet_id node threads_insight.js');
    return;
  }
  
  // 儲存資料到指定的試算表
  try {
    console.log('=== 更新試算表 ===');
    
    // 取得日期範圍
    let since = process.env.SINCE_DATE || null;
    let until = process.env.UNTIL_DATE || null;
    
    // 如果沒有指定日期範圍，則自動取得上一次執行時間
    if (!since && !until) {
      console.log('未指定日期範圍，正在取得上一次執行時間...');
      
      // 取得上一次執行時間作為 since
      since = await threadsAPI.getLastSchedulerExecutionTime();
      
      // 取得當前時間作為 until
      until = threadsAPI.getCurrentDate();
      
      if (since) {
        console.log(`自動設定日期範圍: ${since} 到 ${until}`);
        
        // 檢查是否 since == until，如果是就直接跳過
        if (since === until) {
          console.log('日期範圍相同，沒有新資料需要更新，直接結束');
          console.log('程式執行完成');
          process.exit(0);
        }
        
        // 檢查 since 是否為完整的時間戳，如果是則轉換為日期格式用於 API 呼叫
        if (since && since.includes('T')) {
          const sinceDate = new Date(since).toISOString().split('T')[0];
          console.log(`將時間戳轉換為日期格式用於 API: ${since} -> ${sinceDate}`);
          since = sinceDate;
        }
      } else {
        console.log('無法取得上一次執行時間，將抓取所有資料');
      }
    }
    
    const result = await threadsAPI.saveToSheet(
      process.env.SPREADSHEET_ID, 
      process.env.SHEET_NAME || 'Threads 資料',
      since,
      until
    );
    if (result) {
      if (result.updatedRows === 0) {
        console.log('沒有新資料需要更新');
      } else {
        console.log('試算表更新成功！');
        console.log('試算表 URL:', result.url);
        console.log('工作表名稱:', result.sheetName);
        console.log('更新行數:', result.updatedRows);
      }
    } else {
      console.error('試算表更新失敗');
    }

    console.log('\n所有資料處理完成！');
  } catch (error) {
    console.error('執行過程中發生錯誤:', error);
  }
}

// 匯出類別和主函數
module.exports = { ThreadsAPILocal, main };

// 如果直接執行此檔案，則運行 main 函數
if (require.main === module) {
  main().then(() => {
    console.log('程式執行完成');
    process.exit(0);
  }).catch((error) => {
    console.error('程式執行失敗:', error);
    process.exit(1);
  });
}
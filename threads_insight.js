// threads-api-local.js - 本地版本的 Threads API 處理程式
const fs = require('fs').promises;
const path = require('path');

class ThreadsAPILocal {
  constructor() {
    this.configFile = path.join(__dirname, 'config.json');
    this.dataFile = path.join(__dirname, 'threads-data.json');
  }

  // 設定 access token
  async setAccessToken(accessToken) {
    try {
      const config = { THREADS_ACCESS_TOKEN: accessToken };
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
      console.log('Access token 已成功儲存到本地設定檔');
    } catch (error) {
      console.error('儲存 access token 失敗:', error);
    }
  }

  // 取得已儲存的 access token
  async getStoredAccessToken() {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(configData);
      const accessToken = config.THREADS_ACCESS_TOKEN;
      
      if (accessToken) {
        console.log('Access token 已存在');
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

  // 刪除已儲存的 access token
  async deleteAccessToken() {
    try {
      await fs.unlink(this.configFile);
      console.log('Access token 已刪除');
    } catch (error) {
      console.log('刪除 access token 時發生錯誤:', error);
    }
  }

  // 延遲函數（替代 Utilities.sleep）
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 取得所有純文字貼文
  async getAllTextPosts() {
    const accessToken = await this.getStoredAccessToken();
    
    if (!accessToken) {
      console.error('找不到 Access Token，請先執行 setAccessToken()');
      return null;
    }

    let allTextPosts = [];
    let nextUrl = `https://graph.threads.net/v1.0/me/threads?fields=id,media_type,media_url,permalink,timestamp,text&access_token=${accessToken}`;
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
        
        // 過濾出 media_type 為 TEXT_POST 的貼文
        const textPosts = data.data ? data.data.filter(post => post.media_type === 'TEXT_POST') : [];
        
        // 將這一頁的純文字貼文加入總陣列
        allTextPosts = allTextPosts.concat(textPosts);
        
        console.log(`第 ${pageCount} 頁找到 ${textPosts.length} 則純文字貼文`);
        console.log(`目前總共 ${allTextPosts.length} 則純文字貼文`);
        
        // 檢查是否有下一頁
        nextUrl = data.paging && data.paging.next ? data.paging.next : null;
        
        // 添加延遲避免 API 限制
        if (nextUrl) {
          await this.sleep(500);
        }
      }
      
      console.log(`抓取完成！總共 ${pageCount} 頁，${allTextPosts.length} 則純文字貼文`);
      
      // 建立 id: permalink 的對應物件
      const idPermalinkMap = {};
      allTextPosts.forEach(post => {
        idPermalinkMap[post.id] = post.permalink;
      });
      
      console.log('ID 與 Permalink 對應:');
      console.log(idPermalinkMap);
      
      return {
        posts: allTextPosts,
        idPermalinkMap: idPermalinkMap,
        totalCount: allTextPosts.length
      };
      
    } catch (error) {
      console.error('錯誤:', error);
      console.log(`已抓取 ${allTextPosts.length} 則純文字貼文（在錯誤發生前）`);
      
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

  // 只取得 id: permalink 對應的函數
  async getTextPostsIdPermalinkMap() {
    const result = await this.getAllTextPosts();
    
    if (result && result.idPermalinkMap) {
      console.log('純文字貼文 ID 與 Permalink 對應:');
      console.log(result.idPermalinkMap);
      return result.idPermalinkMap;
    }
    
    return {};
  }

  // 取得純文字貼文的統計資訊
  async getTextPostsStats() {
    const result = await this.getAllTextPosts();
    
    if (!result || !result.posts || result.posts.length === 0) {
      console.log('沒有找到純文字貼文');
      return null;
    }
    
    const textPosts = result.posts;
    
    // 計算統計資訊
    const stats = {
      totalCount: textPosts.length,
      latestPost: textPosts[0], // 假設按時間排序，第一個是最新的
      oldestPost: textPosts[textPosts.length - 1],
      idPermalinkMap: result.idPermalinkMap
    };
    
    console.log('純文字貼文統計:');
    console.log(`總數: ${stats.totalCount}`);
    console.log(`最新貼文時間: ${stats.latestPost?.timestamp}`);
    console.log(`最舊貼文時間: ${stats.oldestPost?.timestamp}`);
    
    return stats;
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

  // 取得所有純文字貼文並包含洞察資料
  async getAllTextPostsWithInsights() {
    console.log('開始取得所有純文字貼文...');
    
    // 先取得所有純文字貼文
    const postsResult = await this.getAllTextPosts();
    
    if (!postsResult || !postsResult.idPermalinkMap || !postsResult.posts) {
      console.error('無法取得純文字貼文資料');
      return null;
    }
    
    const { idPermalinkMap, posts } = postsResult;
    const threadIds = Object.keys(idPermalinkMap);
    
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
    
    console.log(`找到 ${threadIds.length} 則純文字貼文，開始取得洞察資料...`);
    
    const allInsights = {};
    let processedCount = 0;
    
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
      
      // 添加延遲避免 API 限制
      if (processedCount < threadIds.length) {
        await this.sleep(500);
      }
    }
    
    console.log('處理完成！');
    console.log('最終結果:', allInsights);
    
    return allInsights;
  }

  // 將結果儲存到 JSON 檔案
  async saveToJSON() {
    console.log('開始取得資料並儲存到 JSON 檔案...');
    
    // 取得所有貼文資料
    const allInsights = await this.getAllTextPostsWithInsights();
    
    if (!allInsights) {
      console.error('無法取得貼文資料');
      return;
    }
    
    try {
      // 準備要儲存的資料
      const dataToSave = {
        timestamp: new Date().toISOString(),
        totalPosts: Object.keys(allInsights).length,
        data: Object.values(allInsights).map(post => ({
          text: post.text || '',
          permalink: post.permalink,
          views: post.stats?.views || 0,
          likes: post.stats?.likes || 0,
          replies: post.stats?.replies || 0,
          reposts: post.stats?.reposts || 0,
          quotes: post.stats?.quotes || 0,
          shares: post.stats?.shares || 0
        }))
      };
      
      // 儲存到 JSON 檔案
      await fs.writeFile(this.dataFile, JSON.stringify(dataToSave, null, 2));
      
      console.log(`資料已儲存到: ${this.dataFile}`);
      console.log(`總共儲存了 ${dataToSave.totalPosts} 則貼文資料`);
      
      return {
        filename: this.dataFile,
        totalPosts: dataToSave.totalPosts
      };
      
    } catch (error) {
      console.error('儲存 JSON 檔案時發生錯誤:', error);
      return null;
    }
  }

  // 將結果儲存到 CSV 檔案
  async saveToCSV() {
    console.log('開始取得資料並儲存到 CSV 檔案...');
    
    // 取得所有貼文資料
    const allInsights = await this.getAllTextPostsWithInsights();
    
    if (!allInsights) {
      console.error('無法取得貼文資料');
      return;
    }
    
    try {
      // 準備 CSV 標題
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
      
      // 準備 CSV 內容
      const csvRows = [headers.join(',')];
      
      Object.values(allInsights).forEach(post => {
        const stats = post.stats || {};
        const row = [
          `"${(post.text || '').replace(/"/g, '""')}"`, // 處理 CSV 中的引號
          post.permalink,
          stats.views || 0,
          stats.likes || 0,
          stats.replies || 0,
          stats.reposts || 0,
          stats.quotes || 0,
          stats.shares || 0
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      const csvFile = path.join(__dirname, 'threads-data.csv');
      
      // 儲存到 CSV 檔案
      await fs.writeFile(csvFile, csvContent);
      
      console.log(`資料已儲存到: ${csvFile}`);
      console.log(`總共儲存了 ${Object.keys(allInsights).length} 則貼文資料`);
      
      return {
        filename: csvFile,
        totalPosts: Object.keys(allInsights).length
      };
      
    } catch (error) {
      console.error('儲存 CSV 檔案時發生錯誤:', error);
      return null;
    }
  }
}

// 使用範例
async function main() {
  const threadsAPI = new ThreadsAPILocal();
  
  // 設定 access token（第一次使用時需要）
  // await threadsAPI.setAccessToken('你的_access_token');
  
  // 檢查是否有儲存的 token
  const token = await threadsAPI.getStoredAccessToken();
  if (!token) {
    console.log('請先設定 access token:');
    console.log('await threadsAPI.setAccessToken("你的_access_token");');
    return;
  }
  
  // 取得並儲存資料
  try {
    // 儲存為 JSON
    // await threadsAPI.saveToJSON();
    
    // 儲存為 CSV
    await threadsAPI.saveToCSV();
    
    console.log('所有資料處理完成！');
  } catch (error) {
    console.error('執行過程中發生錯誤:', error);
  }
}

// 匯出類別和主函數
module.exports = { ThreadsAPILocal, main };

// 如果直接執行此檔案，則運行 main 函數
if (require.main === module) {
  main();
}
import functions_framework
import requests
import os
from google.cloud import secretmanager
import json
from datetime import datetime

@functions_framework.http
def refresh_threads_token(request):
    """HTTP Cloud Function to refresh Threads API access token."""
    
    # 設置 CORS headers
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }
    
    try:
        # 從 Secret Manager 獲取 access token
        client = secretmanager.SecretManagerServiceClient()
        secret_name = os.environ.get('THREADS_SECRET_NAME', 'house-wang-threads-api')
        name = f"projects/{os.environ.get('GOOGLE_CLOUD_PROJECT', 'your-project-id')}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        access_token = response.payload.data.decode("UTF-8")
        
        # 構建 Threads API 請求
        url = "https://graph.threads.net/refresh_access_token"
        params = {
            "grant_type": "th_refresh_token",
            "access_token": access_token
        }
        
        # 發送請求到 Threads API
        response = requests.get(url, params=params)
        
        if response.status_code == 200:
            result = response.json()
            
            # 新增：寫回 Secret Manager
            new_access_token = result.get("access_token")
            if new_access_token:
                parent = f"projects/{os.environ.get('GOOGLE_CLOUD_PROJECT', 'your-project-id')}/secrets/{secret_name}"
                payload = {"data": new_access_token.encode("UTF-8")}
                client.add_secret_version(parent=parent, payload=payload)
            
            # 記錄成功日誌
            print(f"Token refresh successful at {datetime.now()}")
            
            return (json.dumps({
                "success": True,
                "data": result,
                "timestamp": datetime.now().isoformat()
            }), 200, headers)
        else:
            # 記錄錯誤日誌
            print(f"Token refresh failed with status {response.status_code}: {response.text}")
            
            return (json.dumps({
                "success": False,
                "error": f"API request failed with status {response.status_code}",
                "details": response.text,
                "timestamp": datetime.now().isoformat()
            }), response.status_code, headers)
            
    except Exception as e:
        # 記錄異常日誌
        print(f"Error refreshing token: {str(e)}")
        
        return (json.dumps({
            "success": False,
            "error": "Internal server error",
            "details": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500, headers) 
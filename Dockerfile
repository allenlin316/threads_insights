# 使用 Ubuntu 22.04 作為基礎映像
FROM ubuntu:22.04

# 設定環境變數避免互動式安裝
ENV DEBIAN_FRONTEND=noninteractive

# 更新套件列表並安裝必要的套件
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Node.js 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# 安裝 Google Cloud SDK
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - \
    && apt-get update && apt-get install -y google-cloud-cli

# 創建應用程式目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝 Node.js 依賴
RUN npm ci --only=production

# 複製應用程式代碼
COPY . .

# 創建資料目錄
RUN mkdir -p /app/data

# 設定環境變數
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

# 暴露端口（Cloud Run 會自動處理）
EXPOSE 8080

# 啟動應用程式
CMD ["node", "threads_insight.js"] 
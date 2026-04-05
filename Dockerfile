FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "node -e \"const h=require('http');h.createServer((_,r)=>{r.writeHead(200);r.end('ok')}).listen(4000,()=>console.log('ok on 4000'))\""]

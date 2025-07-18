FROM node:18
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y netcat-openbsd && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 3001
COPY wait-for.sh /usr/src/app/wait-for.sh
RUN chmod +x /usr/src/app/wait-for.sh
CMD ["./wait-for.sh", "mysql:3306", "npm", "run", "dev"]

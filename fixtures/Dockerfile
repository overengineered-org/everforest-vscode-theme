FROM node:24-alpine

WORKDIR /workspace
COPY package.json ./
RUN npm install --omit=dev

CMD ["npm", "start"]

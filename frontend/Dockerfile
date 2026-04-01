FROM node:18

WORKDIR /app

COPY . .
RUN Npm install 
RUN npm build 
RUN Npm install -g serve 

EXPOSE 3000
CMD["serve", "-s", "dis", "-l", "3000"]

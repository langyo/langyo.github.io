FROM nginx:latest

COPY index.html /usr/share/nginx/html/index.html
COPY favicon.ico /usr/share/nginx/html/favicon.ico
EXPOSE 80

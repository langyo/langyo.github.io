FROM nginx:mainline

COPY ./public /www
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

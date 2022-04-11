FROM nginx:mainline
WORKDIR /app
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./res/images /app
COPY ./dist /app

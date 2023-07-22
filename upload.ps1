docker build -t homepage .

# 这部分指令只有我本人能执行，其他人如有需要，请自行换源
docker tag homepage:latest registry.cn-shanghai.aliyuncs.com/langyo/homepage:latest
docker push registry.cn-shanghai.aliyuncs.com/langyo/homepage:latest

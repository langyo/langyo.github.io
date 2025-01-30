# zola build
docker build -t homepage .

# 这部分指令只有我本人能执行，其他人如有需要，请自行换源
docker tag homepage:latest crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest
docker push crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest

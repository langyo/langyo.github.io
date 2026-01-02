# Default recipe
default:
    @just --list

# Publish to container registry (uses podman by default)
publish *args="podman":
    @just _publish_{{args}}

# Publish using docker
_publish_docker:
    docker build -t homepage .
    docker tag homepage:latest crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest
    docker push crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest

# Publish using podman
_publish_podman:
    podman build -t homepage -f ./dockerfile
    podman tag homepage:latest crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest
    podman push crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage:latest

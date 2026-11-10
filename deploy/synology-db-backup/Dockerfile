# 群晖上的备份容器：平时只用 rsync 拉香港生成好的备份文件；
# 演练时用自带的 PG17 起一个临时库验证能否恢复。主版本必须与香港库一致（17）。
FROM postgres:17-alpine

RUN apk add --no-cache bash coreutils util-linux findutils tar zstd openssh-client rsync curl su-exec

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0755 /usr/local/bin/backup.sh

ENTRYPOINT []
CMD ["sleep", "infinity"]

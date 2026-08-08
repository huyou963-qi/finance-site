FROM alpine:3.20

RUN apk add --no-cache autossh openssh-client tinyproxy

COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
COPY start.sh /usr/local/bin/start-china-official-proxy
RUN chmod 0755 /usr/local/bin/start-china-official-proxy

ENTRYPOINT ["/usr/local/bin/start-china-official-proxy"]

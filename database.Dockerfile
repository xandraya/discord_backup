FROM postgres:alpine
WORKDIR /docker-entrypoint-initdb.d
COPY --chown=968:968 --chmod=755 db_init.sh .
EXPOSE 8081/tcp
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]

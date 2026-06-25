echo 'Clean redis.......... '
docker exec findu-redis sh -c "redis-cli --scan --pattern 'matchmaking:*' | xargs -r redis-cli del"
echo 'Clean complete!'
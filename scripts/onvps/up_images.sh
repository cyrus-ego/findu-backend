echo "Starting app..."
docker compose -f ../../docker-compose.prod.yml --env-file ../../.env.pod up -d app
echo "App started."

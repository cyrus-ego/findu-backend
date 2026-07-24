echo "Pulling latest images for app..."
docker compose -f ../../docker-compose.prod.yml --env-file ../../.env.pod pull app
echo "Pull image complete."

image:
	docker build . -t demsking/ghost-api-proxy:latest

publish: image
	docker push demsking/ghost-api-proxy:latest
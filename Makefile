.PHONY: build run test clean lint fmt

BINARY_NAME=ax
BUILD_DIR=bin

build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/ax

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

test:
	go test ./... -v

clean:
	rm -rf $(BUILD_DIR)
	go clean

lint:
	golangci-lint run ./...

fmt:
	go fmt ./...
	goimports -w .

# Build for all platforms
build-all:
	GOOS=darwin GOARCH=arm64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 ./cmd/ax
	GOOS=darwin GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/ax
	GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/ax

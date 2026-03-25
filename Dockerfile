FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /ax ./cmd/ax

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /ax /usr/local/bin/ax
EXPOSE 8080
ENTRYPOINT ["ax"]
CMD ["server", "--port", "8080"]

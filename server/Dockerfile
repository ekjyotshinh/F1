FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.* ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o server main.go

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/server .

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Run the server
CMD ["./server"]

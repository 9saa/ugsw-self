import http.server
import socketserver

# Set the port number (e.g., 8000, 8080)
PORT = 8000

# Tell the server to use the built-in simple request handler
Handler = http.server.SimpleHTTPRequestHandler

# Bind the server to localhost and start it
with socketserver.TCPServer(("localhost", PORT), Handler) as httpd:
    print(f"Server successfully started at http://localhost:{PORT}")
    print("Press Ctrl+C to stop the server.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")

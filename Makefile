.PHONY: run dev install stop start-mongodb stop-mongodb

run: start-mongodb
	@echo "🚀 Starting Website (with Admin) and Backend..."
	@cd Backend && npm run dev &
	@cd Website && npm run dev &
	@echo "✅ Website: http://localhost:5180"
	@echo "✅ Admin login: http://localhost:5180/admin/login"
	@echo "✅ Backend: http://localhost:5001"
	@echo "Press Ctrl+C to stop both servers"

dev: run

install:
	@echo "📦 Installing dependencies..."
	@cd Backend && npm install
	@cd Mobile && npm install
	@cd Website && npm install

website:
	@echo "🌐 Starting public website..."
	@cd Website && npm run dev

start-mongodb:
	@echo "Starting MongoDB..."
	@if ! lsof -i :27017 > /dev/null 2>&1; then \
		mongod --config /opt/homebrew/etc/mongod.conf --fork --logpath /tmp/mongodb.log > /dev/null 2>&1; \
		echo "MongoDB started on port 27017"; \
	else \
		echo "MongoDB already running on port 27017"; \
	fi

stop-mongodb:
	@echo "Stopping MongoDB..."
	@if lsof -i :27017 > /dev/null 2>&1; then \
		pkill -f mongod; \
		echo "MongoDB stopped"; \
	else \
		echo "MongoDB not running"; \
	fi

stop:
	@echo "Stopping Website and Backend..."
	@pkill -f "vite"
	@pkill -f "nodemon"
	@echo "Servers stopped"

# Use an official lightweight Node image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the project files
COPY . .

# Expose the port your app uses
EXPOSE 9000

# Default command to start your site
CMD ["npm", "run", "both"]
#!/bin/bash

# YouTube Analytics Endpoints Test Script
# This script tests all the YouTube analytics endpoints to ensure they're working properly

BASE_URL="http://localhost:3000"
AUTH_TOKEN="your_jwt_token_here"  # Replace with actual JWT token

echo "🧪 Testing YouTube Analytics Endpoints"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"

    echo -e "\n${BLUE}Testing: $name${NC}"
    echo "URL: $method $url"

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $AUTH_TOKEN" "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Authorization: Bearer $AUTH_TOKEN" -H "Content-Type: application/json" -d "$data" "$url")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo -e "${GREEN}✅ Success ($http_code)${NC}"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        echo -e "${RED}❌ Failed ($http_code)${NC}"
        echo "Response: $body"
    fi
}

# Test Rising Stars Endpoints
echo -e "\n${YELLOW}📈 Testing Rising Stars Endpoints${NC}"

# Test auth status
test_endpoint "YouTube Auth Status" "GET" "$BASE_URL/youtube/rising-stars/auth-status"

# Test rising stars with different parameters
test_endpoint "Rising Stars (default)" "GET" "$BASE_URL/youtube/rising-stars"
test_endpoint "Rising Stars (day range)" "GET" "$BASE_URL/youtube/rising-stars?timeRange=day"
test_endpoint "Rising Stars (week range)" "GET" "$BASE_URL/youtube/rising-stars?timeRange=week"
test_endpoint "Rising Stars (with niche)" "GET" "$BASE_URL/youtube/rising-stars?niche=comedy&timeRange=day"
test_endpoint "Rising Stars (with subscriber filter)" "GET" "$BASE_URL/youtube/rising-stars?subscriberRange=small&timeRange=day"
test_endpoint "Rising Stars (with music analysis)" "GET" "$BASE_URL/youtube/rising-stars?includeMusicAnalysis=true&timeRange=day"
test_endpoint "Rising Stars (with geographic filter)" "GET" "$BASE_URL/youtube/rising-stars?regionCode=US&includeLocalCreators=true&timeRange=day"

# Test music trends
test_endpoint "Music Trends Analysis" "GET" "$BASE_URL/youtube/rising-stars/music-trends"
test_endpoint "Music Trends (with niche)" "GET" "$BASE_URL/youtube/rising-stars/music-trends?niche=comedy&timeRange=week"

# Test outliers
test_endpoint "Outlier Detection (24h)" "GET" "$BASE_URL/youtube/rising-stars/outliers?timeRange=24h"
test_endpoint "Outlier Detection (7d)" "GET" "$BASE_URL/youtube/rising-stars/outliers?timeRange=7d"
test_endpoint "Outlier Detection (with niche)" "GET" "$BASE_URL/youtube/rising-stars/outliers?timeRange=24h&niche=comedy"

# Test Competitor Analysis Endpoints
echo -e "\n${YELLOW}🏆 Testing Competitor Analysis Endpoints${NC}"

test_endpoint "Competitor Analysis (general)" "GET" "$BASE_URL/youtube/competitors?niche=comedy"
test_endpoint "Competitor Analysis (with limit)" "GET" "$BASE_URL/youtube/competitors?niche=comedy&limit=5"
test_endpoint "Top Competitors" "GET" "$BASE_URL/youtube/competitors/top?niche=comedy&limit=3"
test_endpoint "Market Gaps" "GET" "$BASE_URL/youtube/competitors/gaps?niche=comedy"
test_endpoint "Strategic Recommendations" "GET" "$BASE_URL/youtube/competitors/recommendations?niche=comedy"
# Test Analytics Service Endpoints
echo -e "\n${YELLOW}📊 Testing Analytics Service Endpoints${NC}"

test_endpoint "Video Analytics" "GET" "$BASE_URL/youtube/analytics/video/sample_video_id"
test_endpoint "Trend Analysis (24h)" "GET" "$BASE_URL/youtube/analytics/trends?timeRange=24h"
test_endpoint "Trend Analysis (7d)" "GET" "$BASE_URL/youtube/analytics/trends?timeRange=7d"
test_endpoint "Niche Analysis" "GET" "$BASE_URL/youtube/analytics/niche?niche=comedy"



# Test Content Ideas
echo -e "\n${YELLOW}💡 Testing Content Ideas Endpoints${NC}"

test_endpoint "Content Ideas" "GET" "$BASE_URL/youtube/content-ideas?niche=comedy"
test_endpoint "Content Ideas (with count)" "GET" "$BASE_URL/youtube/content-ideas?niche=comedy&count=10"

# Test Outlier Detection
echo -e "\n${YELLOW}🔍 Testing Outlier Detection Endpoints${NC}"

test_endpoint "Outlier Detection" "GET" "$BASE_URL/youtube/outlier-detection?timeRange=24h"
test_endpoint "Outlier Detection (with niche)" "GET" "$BASE_URL/youtube/outlier-detection?timeRange=24h&niche=comedy"

echo -e "\n${GREEN}✅ All tests completed!${NC}"
echo -e "\n${YELLOW}📝 Notes:${NC}"
echo "- Make sure to replace 'your_jwt_token_here' with a valid JWT token"
echo "- Ensure the server is running on localhost:3000"
echo "- Some endpoints may require YouTube authentication"
echo "- Check the responses for any error messages or missing data"

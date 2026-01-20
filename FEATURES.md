# Newslett Backend Features

Complete feature documentation for the unified Newslett backend API.

---

## 📰 News Features

### Core News API
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Get All News | `GET /api/news` | Paginated news feed with filtering |
| Get Single Article | `GET /api/news/:id` | Article with AI-generated summary |
| Sync News | `POST /api/news/sync` | Manual trigger for news sync |
| Daily Brief | `GET /api/news/daily-brief` | Curated daily news selection |

### AI-Powered Processing
| Feature | Description | AI Provider |
|---------|-------------|-------------|
| **Smart Summaries** | 50-120 word neutral summaries | Gemma 3 API |
| **Why This Matters** | One-liner explaining article relevance | Gemma 3 API |
| **Mood Classification** | Categorize as calm/neutral/serious | Keyword-based |
| **Q&A** | Answer questions about articles | Gemma 3 API |
| **Satirical Mode** | Gen Z meme-style content | OpenRouter (free) |
| **Polite Rewrite** | Improve comment tone | Gemma 3 API |
| **Fact Verification** | Check article accuracy | Gemma 3 API |

### News Sources
- **NewsAPI** - Top headlines from US
- **New York Times** - Top stories
- **Mock Data** - Development fallback

### Change Tracking
- **Delta Detection** - Track what changed since yesterday
- **Version History** - Store up to 5 previous versions

---

## 🔐 Authentication Features

### Auth Methods
| Method | Endpoint | Description |
|--------|----------|-------------|
| Google OAuth | `POST /api/auth/google` | Sign in with Google ID token |
| Email Register | `POST /api/auth/register` | Create account with password |
| Email Login | `POST /api/auth/login` | Sign in with email/password |
| Get Profile | `GET /api/auth/me` | Get current user (requires auth) |
| Update Profile | `PUT /api/auth/profile` | Update name, bio, avatar |

### Security Features
- **JWT Tokens** - Secure session management
- **Bcrypt Hashing** - Password encryption (10 salt rounds)
- **Rate Limiting** - 100 requests per 15 min on auth routes
- **Google Token Verification** - OAuth2Client validation

---

## 📝 Blog/Creator Features

### Blog CRUD
| Feature | Endpoint | Description |
|---------|----------|-------------|
| List Blogs | `GET /api/blogs` | Public published blogs |
| My Blogs | `GET /api/blogs/my` | User's own blogs |
| Create Blog | `POST /api/blogs` | New blog (verified users) |
| Update Blog | `PUT /api/blogs/:id` | Edit own blog |
| Delete Blog | `DELETE /api/blogs/:id` | Remove own blog |
| Get by Slug | `GET /api/blogs/:slug` | Single blog with analytics |

### Engagement
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Like Blog | `POST /api/blogs/:id/like` | Toggle like (removes dislike) |
| Dislike Blog | `POST /api/blogs/:id/dislike` | Toggle dislike (removes like) |
| View Tracking | Automatic | Increments on blog view |

### Categories
`technology`, `politics`, `sports`, `entertainment`, `business`, `health`, `science`, `lifestyle`, `opinion`, `other`

---

## 📊 Analytics Dashboard

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Overview | `GET /api/analytics/overview` | Total blogs, views, likes, followers |
| Blog Stats | `GET /api/analytics/blogs` | Per-blog performance |
| Timeline | `GET /api/analytics/timeline` | Last 30 days views/likes chart |
| Single Blog | `GET /api/analytics/blog/:id` | Detailed blog analytics |

---

## 💳 Payment Features (Razorpay)

### Subscription Plans
| Plan | Price | Period |
|------|-------|--------|
| Monthly | Configurable | 30 days |
| Yearly | Configurable | 365 days |

### Payment API
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Get Plans | `GET /api/payment/plans` | Available subscription plans |
| Create Order | `POST /api/payment/create-order` | Start payment flow |
| Verify Payment | `POST /api/payment/verify` | Confirm successful payment |
| Request Refund | `POST /api/payment/refund` | Process refund |
| Payment Status | `GET /api/payment/status/:id` | Check payment state |
| Get Key | `GET /api/payment/key` | Public Razorpay key for frontend |

---

## 👤 User Features

### User Management
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Get User Profile | `GET /api/users/:id` | Public user profile |
| Update Preferences | `PUT /api/users/preferences` | News category preferences |
| Save Article | `POST /api/users/saved` | Bookmark an article |
| Get Saved | `GET /api/users/saved` | List bookmarked articles |

### Social Features
| Feature | Description |
|---------|-------------|
| Follow/Unfollow | Follow other creators |
| Followers Count | Track audience size |
| Following Count | Track who you follow |
| Verified Badge | For verified creators |

---

## 💬 Comments Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Get Comments | `GET /api/comments/:articleId` | Comments on an article |
| Add Comment | `POST /api/comments` | Post new comment |
| Update Comment | `PUT /api/comments/:id` | Edit own comment |
| Delete Comment | `DELETE /api/comments/:id` | Remove own comment |
| AI Rewrite | `POST /api/comments/rewrite` | Make comment more polite |

---

## ✅ Verification System

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Request Verification | `POST /api/verification/request` | Apply for verified badge |
| Check Status | `GET /api/verification/status` | Current verification state |
| Admin Approve | `POST /api/verification/approve` | Admin approves user |

---

## ⚙️ System Features

### Scheduled Tasks (Cron Jobs)
| Task | Schedule | Description |
|------|----------|-------------|
| News Sync | Every 15 min | Fetch news from all sources |
| Daily Brief | 5 AM daily | Select curated articles |

### Deployment
- **Vercel Ready** - Serverless configuration included
- **Health Check** - `GET /health` endpoint
- **Graceful Shutdown** - Proper SIGTERM handling

### Logging
- Morgan HTTP logging
- Custom Winston-like logger
- Request timing middleware

---

## 🔑 Environment Variables Required

```env
# Database
MONGODB_URI=mongodb+srv://...

# News APIs
NEWS_API_KEY=your_newsapi_key
NYT_API_KEY=your_nyt_key

# AI Services
GEMMA3_API_ENDPOINT=https://...
GEMMA3_API_KEY=your_gemma_key
OPENROUTER_API_KEY=your_openrouter_key

# Authentication
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret

# Payments
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

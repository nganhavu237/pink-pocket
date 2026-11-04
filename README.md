
# Pink Pocket

A full-stack personal finance application designed to help users track expenses, manage budgets, and better understand their spending habits through an intuitive dashboard and data visualization.

## Overview

Pink Pocket provides a centralized platform for managing personal finances. Users can record income and expenses, organize transactions into categories, set monthly budgets, and monitor their financial activity over time.

The project focuses on building a responsive, user-friendly application while implementing core software engineering concepts such as RESTful API development, authentication, relational database management, and data visualization.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Lucide React

### Backend
- Node.js
- Express.js
- TypeScript
- Prisma ORM

### Database
- PostgreSQL

### Authentication
- JSON Web Tokens (JWT)
- bcrypt for password hashing

### Development Tools
- Git & GitHub
- Visual Studio Code
- Postman
- Docker (optional)

## Features

### 1. User Authentication
- User registration and login
- Secure password hashing
- JWT-based authentication
- Protected routes
- User-specific financial data

### 2. Dashboard
- Total income and expenses
- Current balance
- Monthly spending summary
- Recent transactions
- Budget progress indicators
- Interactive financial charts

### 3. Transaction Management
- Add, edit, and delete transactions
- Record transaction amounts, dates, and descriptions
- Classify transactions as income or expenses
- Assign categories to transactions
- Filter transactions by date, category, or type
- Search transaction history

### 4. Budget Management
- Create monthly budgets
- Set spending limits for individual categories
- Track budget usage
- Display remaining budget amounts
- Highlight exceeded budgets

### 5. Financial Analytics
- Monthly income and expense trends
- Spending breakdown by category
- Visualize financial data using charts
- Compare spending across different periods
- Identify major spending categories

### 6. User Settings
- Update account information
- Manage expense categories
- Select preferred currency
- Customize application preferences

## UI/UX Design

The application will use a modern, minimal interface with a consistent color system, responsive layouts, and accessible components.

### Color Palette

| Purpose | Color | HEX |
|---------|-------|-----|
| Primary | Soft Pink | `#F4A7B9` |
| Secondary | Light Pink | `#FCE4EC` |
| Background | White | `#FFFFFF` |
| Surface | Off-White | `#FFF9FB` |
| Accent 1 | Lavender | `#E6D9F2` |
| Accent 2 | Sage Green | `#DCEBDD` |
| Accent 3 | Light Blue | `#DCEAF7` |
| Primary Text | Dark Gray | `#333333` |
| Secondary Text | Muted Gray | `#777777` |

### Design Guidelines
- Clean and consistent layouts
- Rounded cards and buttons
- Subtle shadows and borders
- Clear typography and visual hierarchy
- Responsive design for desktop and mobile
- Consistent spacing and reusable components
- Accessible form controls and navigation
- Interactive charts with clear labels

## Application Pages

### Landing Page
- Application introduction
- Key features
- Login and registration navigation

### Authentication Pages
- Login form
- Registration form
- Form validation and error handling

### Dashboard
- Financial summary cards
- Monthly expense visualization
- Budget overview
- Recent transaction activity

### Transactions
- Transaction table or list
- Add and edit transaction forms
- Search and filtering options
- Delete transaction functionality

### Budgets
- Monthly budget creation
- Category-level spending limits
- Budget progress visualization

### Analytics
- Income and expense charts
- Category spending distribution
- Monthly financial comparisons

### Settings
- Account preferences
- Currency selection
- Category management

## System Architecture

The application follows a client-server architecture.

```text
React + TypeScript
       |
       | HTTP Requests
       v
Node.js + Express REST API
       |
       | Prisma ORM
       v
   PostgreSQL
```

### Frontend Responsibilities
- Render application components
- Manage client-side state
- Handle forms and user interactions
- Communicate with backend APIs
- Display charts and financial summaries

### Backend Responsibilities
- Authenticate users
- Validate incoming requests
- Process financial transactions
- Calculate financial summaries
- Enforce user-level data access
- Communicate with the database

## Database Design

The initial database contains four primary models.

### User

| Field | Type |
|-------|------|
| id | UUID (Primary Key) |
| name | String |
| email | String (Unique) |
| passwordHash | String |
| createdAt | DateTime |

### Transaction

| Field | Type |
|-------|------|
| id | UUID (Primary Key) |
| userId | UUID (Foreign Key) |
| categoryId | UUID (Foreign Key) |
| amount | Decimal |
| type | Enum (INCOME, EXPENSE) |
| description | String |
| date | DateTime |
| createdAt | DateTime |

### Category

| Field | Type |
|-------|------|
| id | UUID (Primary Key) |
| userId | UUID (Foreign Key) |
| name | String |
| type | Enum (INCOME, EXPENSE) |
| color | String |

### Budget

| Field | Type |
|-------|------|
| id | UUID (Primary Key) |
| userId | UUID (Foreign Key) |
| categoryId | UUID (Foreign Key) |
| amount | Decimal |
| month | Integer |
| year | Integer |

### Relationships

- One User has many Transactions.
- One User has many Categories.
- One User has many Budgets.
- One Category has many Transactions.
- One Category can have multiple Budgets across different months.
- Each Budget belongs to one User and one Category.

## REST API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/auth/me` | Get authenticated user |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | Retrieve transactions |
| POST | `/api/transactions` | Create a transaction |
| GET | `/api/transactions/:id` | Retrieve a transaction |
| PUT | `/api/transactions/:id` | Update a transaction |
| DELETE | `/api/transactions/:id` | Delete a transaction |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | Retrieve categories |
| POST | `/api/categories` | Create a category |
| PUT | `/api/categories/:id` | Update a category |
| DELETE | `/api/categories/:id` | Delete a category |

### Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgets` | Retrieve budgets |
| POST | `/api/budgets` | Create a budget |
| PUT | `/api/budgets/:id` | Update a budget |
| DELETE | `/api/budgets/:id` | Delete a budget |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/summary` | Get financial summary |
| GET | `/api/analytics/monthly` | Get monthly trends |
| GET | `/api/analytics/categories` | Get spending by category |

## Security

- Hash passwords before database storage.
- Validate and sanitize incoming data.
- Protect private API endpoints with authentication.
- Verify record ownership before reading or modifying data.
- Store sensitive configuration in environment variables.
- Do not commit credentials or environment files.
- Configure CORS for approved frontend origins.
- Implement secure authentication and error handling.
- Use HTTPS in production.

## Project Structure

```text
pink-pocket/
│
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── contexts/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.ts
│   └── package.json
│
├── .gitignore
├── README.md
└── LICENSE
```

Note: This structure represents the planned architecture and will be implemented incrementally.

## Development Roadmap

### Phase 1: Project Setup
- [ ] Initialize React + TypeScript frontend
- [ ] Configure Tailwind CSS
- [ ] Create initial application layout
- [ ] Set up Express + TypeScript backend
- [ ] Configure PostgreSQL and Prisma
- [ ] Establish frontend-backend communication

### Phase 2: Authentication
- [ ] Implement user registration
- [ ] Implement user login
- [ ] Add password hashing
- [ ] Implement JWT authentication
- [ ] Add protected routes

### Phase 3: Transaction Management
- [ ] Design transaction database model
- [ ] Implement transaction CRUD APIs
- [ ] Create transaction forms
- [ ] Display transaction history
- [ ] Implement filtering and searching

### Phase 4: Budgeting and Dashboard
- [ ] Implement budget CRUD functionality
- [ ] Calculate monthly financial summaries
- [ ] Build dashboard components
- [ ] Add budget progress indicators
- [ ] Integrate financial charts

### Phase 5: Testing and Deployment
- [ ] Implement frontend and backend tests
- [ ] Validate API error handling
- [ ] Improve responsive design
- [ ] Perform accessibility checks
- [ ] Deploy frontend and backend
- [ ] Configure production database
- [ ] Update documentation with live demo and screenshots

## Future Enhancements

Potential features for future versions include:

- Recurring transactions
- CSV transaction import and export
- Savings goals
- Custom financial reports
- Spending insights and recommendations
- Multi-currency support
- Payment and subscription tracking

## Project Status

**In Development**

Pink Pocket is currently being developed as a personal software engineering project. Features will be implemented incrementally according to the development roadmap.


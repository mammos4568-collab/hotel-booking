# Agoda Database: Table Reference Guide

This document provides a detailed breakdown of each table, its purpose, and its columns within the Agoda database schema.

---

## 1. `users` (Customer Information)
Stores personal details, authentication credentials, and membership tiers for platform users.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `user_id` | SERIAL | PRIMARY KEY | Unique identifier for the user |
| `first_name` | VARCHAR(100) | NOT NULL | User's first name |
| `last_name` | VARCHAR(100) | NOT NULL | User's last name |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User's email address (used for login) |
| `password_hash` | VARCHAR(255) | NOT NULL | Encrypted password string |
| `phone_number` | VARCHAR(50) | - | Contact phone number |
| `membership_tier`| VARCHAR(50) | DEFAULT 'Standard' | Loyalty status (e.g., Standard, Silver, Gold, VIP) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account registration timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last profile update timestamp |

---

## 2. `properties` (Hotel & Accommodation Data)
Contains general information, locations, and ratings for hotels, resorts, and villas.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `property_id` | SERIAL | PRIMARY KEY | Unique identifier for the property |
| `name` | VARCHAR(255) | NOT NULL | Name of the hotel or resort |
| `property_type` | VARCHAR(50) | NOT NULL | Category (e.g., Hotel, Resort, Villa, Apartment) |
| `description` | TEXT | - | Detailed description of the property |
| `country` | VARCHAR(100) | NOT NULL | Country where the property is located |
| `city` | VARCHAR(100) | NOT NULL | City where the property is located |
| `address` | TEXT | NOT NULL | Street address |
| `latitude` | DECIMAL(10,8) | - | Geographical latitude coordinate |
| `longitude` | DECIMAL(11,8) | - | Geographical longitude coordinate |
| `star_rating` | DECIMAL(2,1) | - | Official or average star rating (e.g., 4.5, 5.0) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

---

## 3. `rooms` (Room Types)
Defines the categories and specifications of rooms available at each property.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `room_id` | SERIAL | PRIMARY KEY | Unique identifier for the room type |
| `property_id` | INT | REFERENCES | Links to `properties(property_id)` on cascade delete |
| `room_type_name` | VARCHAR(150) | NOT NULL | Name of the room (e.g., Deluxe King Room) |
| `description` | TEXT | - | Room features and amenities description |
| `max_guests` | INT | NOT NULL | Maximum number of guests allowed in this room |
| `base_price_per_night` | DECIMAL(10,2)| NOT NULL | Standard base price per night |
| `total_rooms` | INT | NOT NULL | Total physical inventory count for this room type |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

---

## 4. `room_inventories` (Daily Stock & Pricing Control)
Handles daily availability to prevent overbooking and powers dynamic pricing strategies.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `inventory_id` | SERIAL | PRIMARY KEY | Unique inventory record identifier |
| `room_id` | INT | REFERENCES | Links to `rooms(room_id)` on cascade delete |
| `date` | DATE | NOT NULL | Specific calendar date for this inventory entry |
| `available_rooms` | INT | NOT NULL | Number of rooms remaining available on this date |
| `price` | DECIMAL(10,2)| NOT NULL | Active price for this specific date (Dynamic Pricing) |
| *Constraint* | UNIQUE | `(room_id, date)` | Ensures only one inventory record per room per day |

---

## 5. `bookings` (Reservations & Transactions)
Records booking transactions made by users for specific properties and rooms.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `booking_id` | SERIAL | PRIMARY KEY | Internal unique booking identifier |
| `booking_reference` | VARCHAR(50) | UNIQUE, NOT NULL | Public reference code shown to the user (e.g., AGD-2026-001) |
| `user_id` | INT | REFERENCES | Links to the customer who booked (`users`) |
| `property_id` | INT | REFERENCES | Links to the booked hotel (`properties`) |
| `room_id` | INT | REFERENCES | Links to the booked room type (`rooms`) |
| `check_in_date` | DATE | NOT NULL | Scheduled check-in date |
| `check_out_date` | DATE | NOT NULL | Scheduled check-out date |
| `num_guests` | INT | NOT NULL | Total number of guests for this stay |
| `total_amount` | DECIMAL(10,2)| NOT NULL | Final calculated price including taxes/fees |
| `payment_status` | VARCHAR(50) | DEFAULT 'Pending' | Payment progress (e.g., Pending, Paid, Failed, Refunded) |
| `booking_status` | VARCHAR(50) | DEFAULT 'Confirmed'| Reservation state (e.g., Confirmed, Cancelled, Completed) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Booking transaction timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last modification timestamp |

---

## 6. `reviews` (Feedback & Ratings)
Allows users to leave feedback and scores after completing a stay.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `review_id` | SERIAL | PRIMARY KEY | Unique identifier for the review |
| `booking_id` | INT | REFERENCES | Links to the associated stay (`bookings`) |
| `user_id` | INT | REFERENCES | Links to the reviewer (`users`) |
| `property_id` | INT | REFERENCES | Links to the reviewed hotel (`properties`) |
| `rating` | DECIMAL(2,1) | NOT NULL | Score given by the user (e.g., 4.5, 5.0) |
| `comment` | TEXT | - | Detailed review text comment |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Review submission timestamp |

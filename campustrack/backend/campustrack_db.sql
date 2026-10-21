-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 26, 2026 at 02:41 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `campustrack_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `assignments`
--

CREATE TABLE `assignments` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `due` date NOT NULL,
  `description` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `assignments`
--

INSERT INTO `assignments` (`id`, `title`, `module_id`, `due`, `description`) VALUES
('1000', 'Assignment 1: Project Proposal', 'mod-isj107v', '2026-03-07', 'Project proposal assignment.'),
('1001', 'Assignment 4: Sorting Algorithms', 'mod-dtd117v', '2026-08-01', 'Sorting algorithms assignment.'),
('1002', 'Written Test 2', 'mod-sec117v', '2026-08-05', 'Second written test.'),
('1003', 'Assignment 2: System Design Document', 'mod-isj107v', '2026-08-15', 'System design document.');

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `id` int(11) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `status` enum('present','late','absent') NOT NULL DEFAULT 'present',
  `marked_at` datetime NOT NULL,
  `lecturer_verified` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `attendance`
--

INSERT INTO `attendance` (`id`, `session_id`, `student_id`, `status`, `marked_at`, `lecturer_verified`) VALUES
(1, 's-1', 'student-1', 'present', '2026-07-20 08:03:00', 1),
(2, 's-3', 'student-1', 'present', '2026-07-21 12:05:00', 1),
(3, 's-4', 'student-1', 'present', '2026-07-23 09:02:00', 1);

-- --------------------------------------------------------

--
-- Table structure for table `courses`
--

CREATE TABLE `courses` (
  `id` varchar(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `faculty` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `duration_years` int(11) NOT NULL DEFAULT 3,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `courses`
--

INSERT INTO `courses` (`id`, `code`, `name`, `faculty`, `department`, `duration_years`, `created_at`) VALUES
('course-dipit', 'DIPIT', 'Diploma in Information Technology', 'Faculty of Information Technology', 'Computer Science', 3, '2026-08-26 12:37:50'),
('course-dipsd', 'DIPSD', 'Diploma in Software Development', 'Faculty of Information Technology', 'Software Engineering', 3, '2026-08-26 12:37:50'),
('course-ndbis', 'NDBIS', 'National Diploma in Business Information Systems', 'Faculty of Management Sciences', 'Business Information Systems', 3, '2026-08-26 12:37:50');

-- --------------------------------------------------------

--
-- Table structure for table `course_modules`
--

CREATE TABLE `course_modules` (
  `id` varchar(36) NOT NULL,
  `course_id` varchar(36) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `year_level` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `course_modules`
--

INSERT INTO `course_modules` (`id`, `course_id`, `module_id`, `year_level`) VALUES
('cm-dipit-ain307v', 'course-dipit', 'mod-ain307v', 3),
('cm-dipit-dbs207v', 'course-dipit', 'mod-dbs207v', 2),
('cm-dipit-dtd117v', 'course-dipit', 'mod-dtd117v', 1),
('cm-dipit-eup117v', 'course-dipit', 'mod-eup117v', 1),
('cm-dipit-isj107v', 'course-dipit', 'mod-isj107v', 1),
('cm-dipit-net307v', 'course-dipit', 'mod-net307v', 3),
('cm-dipit-osy207v', 'course-dipit', 'mod-osy207v', 2),
('cm-dipit-ppr307v', 'course-dipit', 'mod-ppr307v', 3),
('cm-dipit-sec117v', 'course-dipit', 'mod-sec117v', 1),
('cm-dipit-web207v', 'course-dipit', 'mod-web207v', 2),
('cm-dipsd-cap307v', 'course-dipsd', 'mod-cap307v', 3),
('cm-dipsd-isj107v', 'course-dipsd', 'mod-isj107v', 1),
('cm-dipsd-mob307v', 'course-dipsd', 'mod-mob307v', 3),
('cm-dipsd-mth117v', 'course-dipsd', 'mod-mth117v', 1),
('cm-dipsd-oop207v', 'course-dipsd', 'mod-oop207v', 2),
('cm-dipsd-prg117v', 'course-dipsd', 'mod-prg117v', 1),
('cm-dipsd-sen307v', 'course-dipsd', 'mod-sen307v', 3),
('cm-dipsd-sqa207v', 'course-dipsd', 'mod-sqa207v', 2),
('cm-dipsd-web207v', 'course-dipsd', 'mod-web207v', 2),
('cm-ndbis-acc107v', 'course-ndbis', 'mod-acc107v', 1),
('cm-ndbis-ban307v', 'course-ndbis', 'mod-ban307v', 3),
('cm-ndbis-bus107v', 'course-ndbis', 'mod-bus107v', 1),
('cm-ndbis-dbs207v', 'course-ndbis', 'mod-dbs207v', 2),
('cm-ndbis-eco207v', 'course-ndbis', 'mod-eco207v', 2),
('cm-ndbis-erp307v', 'course-ndbis', 'mod-erp307v', 3),
('cm-ndbis-isj107v', 'course-ndbis', 'mod-isj107v', 1);

-- --------------------------------------------------------

--
-- Table structure for table `enrolments`
--

CREATE TABLE `enrolments` (
  `id` int(11) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `enrollment_date` date NOT NULL DEFAULT curdate(),
  `status` enum('active','dropped','completed') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `enrolments`
--

INSERT INTO `enrolments` (`id`, `student_id`, `module_id`, `enrollment_date`, `status`) VALUES
(1, 'student-1', 'mod-isj107v', '2026-08-12', 'active'),
(2, 'student-1', 'mod-sec117v', '2026-08-12', 'active'),
(3, 'student-1', 'mod-dtd117v', '2026-08-12', 'active'),
(4, 'student-2', 'mod-isj107v', '2026-08-12', 'active'),
(5, 'student-3', 'mod-isj107v', '2026-08-12', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `modules`
--

CREATE TABLE `modules` (
  `id` varchar(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `period` varchar(100) NOT NULL,
  `credits` int(11) DEFAULT 0,
  `faculty` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `semester` int(11) DEFAULT 1,
  `year` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `modules`
--

INSERT INTO `modules` (`id`, `code`, `name`, `description`, `period`, `credits`, `faculty`, `department`, `semester`, `year`, `is_active`, `created_by`, `created_at`) VALUES
('10798e0f-d6c3-4812-ae7c-11e6c2421d79', '1WE3A', 'ssac', NULL, 'Second Semester', 0, NULL, NULL, 1, NULL, 1, 'staff-admin-1', '2026-08-14 08:16:41'),
('6d0dd2f3-e9cb-450b-985d-9a0c8735720a', '1234FS', 'sasa', NULL, 'Second Semester', 0, NULL, NULL, 1, NULL, 1, 'staff-admin-1', '2026-08-14 08:12:17'),
('888e61d6-58b1-4401-a894-a5b15e9173e3', '121SAS', 'WY2', NULL, 'First Semester', 0, NULL, NULL, 1, NULL, 1, 'staff-admin-1', '2026-08-24 07:15:23'),
('mod-acc107v', 'ACC107V', 'Financial Accounting Fundamentals', 'Introductory financial accounting.', 'First Semester', 12, 'Faculty of Management Sciences', 'Accounting', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-ain307v', 'AIN307V', 'Artificial Intelligence Introduction', 'Introductory concepts in AI.', 'Second Semester', 16, 'Faculty of Information Technology', 'Computer Science', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-ban307v', 'BAN307V', 'Business Analytics', 'Data-driven decision making for business.', 'Second Semester', 16, 'Faculty of Management Sciences', 'Business Information Systems', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-bus107v', 'BUS107V', 'Introduction to Business', 'Fundamentals of business.', 'First Semester', 12, 'Faculty of Management Sciences', 'Business Information Systems', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-cap307v', 'CAP307V', 'Capstone Project', 'Final year capstone project.', 'Second Semester', 16, 'Faculty of Information Technology', 'Software Engineering', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-dbs207v', 'DBS207V', 'Database Systems', 'Relational database design and SQL.', 'Second Semester', 14, 'Faculty of Information Technology', 'Computer Science', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-dtd117v', 'DTD117V', 'Data Structures', 'Data structures and algorithms.', 'First Semester', 12, 'Faculty of Information Technology', 'Computer Science', 1, 2026, 1, 'staff-admin-1', '2026-08-12 12:19:35'),
('mod-eco207v', 'ECO207V', 'Business Economics', 'Micro and macroeconomics for business.', 'First Semester', 14, 'Faculty of Management Sciences', 'Economics', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-erp307v', 'ERP307V', 'Enterprise Resource Planning Systems', 'ERP systems and implementation.', 'First Semester', 16, 'Faculty of Management Sciences', 'Business Information Systems', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-eup117v', 'EUP117V', 'End-User Programming', 'Introductory end-user programming concepts.', 'First Semester', 12, 'Faculty of Information Technology', 'Computer Science', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-isj107v', 'ISJ107V', 'Information Systems', 'Introduction to Information Systems.', 'First Semester', 12, 'Faculty of Information Technology', 'Computer Science', 1, 2026, 1, 'staff-admin-1', '2026-08-12 12:19:35'),
('mod-mob307v', 'MOB307V', 'Mobile Application Development', 'Building mobile applications.', 'First Semester', 16, 'Faculty of Information Technology', 'Software Engineering', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-mth117v', 'MTH117V', 'Mathematics for Computing', 'Discrete mathematics for computing.', 'First Semester', 12, 'Faculty of Information Technology', 'Software Engineering', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-net307v', 'NET307V', 'Networking Fundamentals', 'Computer networking fundamentals.', 'First Semester', 16, 'Faculty of Information Technology', 'Networking', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-oop207v', 'OOP207V', 'Object-Oriented Programming', 'OOP principles and design.', 'First Semester', 14, 'Faculty of Information Technology', 'Software Engineering', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-osy207v', 'OSY207V', 'Operating Systems', 'Operating system concepts and architecture.', 'Second Semester', 14, 'Faculty of Information Technology', 'Computer Science', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-ppr307v', 'PPR307V', 'Project Management', 'IT project management principles.', 'First Semester', 16, 'Faculty of Information Technology', 'Computer Science', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-prg117v', 'PRG117V', 'Programming Fundamentals', 'Fundamentals of programming logic.', 'First Semester', 12, 'Faculty of Information Technology', 'Software Engineering', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-sec117v', 'SEC117V', 'Systems Engineering Concepts', 'Systems engineering and service-oriented concepts.', 'First Semester', 12, 'Faculty of Information Technology', 'Computer Science', 1, 2026, 1, 'staff-admin-1', '2026-08-12 12:19:35'),
('mod-sen307v', 'SEN307V', 'Software Engineering', 'Software engineering methodologies.', 'First Semester', 16, 'Faculty of Information Technology', 'Software Engineering', 1, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-sqa207v', 'SQA207V', 'Software Quality Assurance', 'Testing and QA methodologies.', 'Second Semester', 14, 'Faculty of Information Technology', 'Software Engineering', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50'),
('mod-web207v', 'WEB207V', 'Web Application Development', 'Building dynamic web applications.', 'First Semester', 14, 'Faculty of Information Technology', 'Computer Science', 2, 2026, 1, 'staff-admin-1', '2026-08-26 12:37:50');

-- --------------------------------------------------------

--
-- Table structure for table `module_lecturers`
--

CREATE TABLE `module_lecturers` (
  `id` varchar(36) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `lecturer_id` varchar(36) NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `assigned_by` varchar(36) DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `module_lecturers`
--

INSERT INTO `module_lecturers` (`id`, `module_id`, `lecturer_id`, `is_primary`, `assigned_by`, `assigned_at`) VALUES
('2371aaf7-b10b-4db5-a409-a0596a297392', '6d0dd2f3-e9cb-450b-985d-9a0c8735720a', 'staff-lect-1', 1, 'staff-admin-1', '2026-08-14 08:12:17'),
('cdbca127-07b0-4efc-875d-a8205af2c670', '10798e0f-d6c3-4812-ae7c-11e6c2421d79', 'staff-lect-1', 1, 'staff-admin-1', '2026-08-14 08:16:41'),
('f8ebb05e-cb0d-40dd-9f12-83b00be44197', '888e61d6-58b1-4401-a894-a5b15e9173e3', '6531ccd1-2353-49fe-8d06-0958e2abb832', 1, 'staff-admin-1', '2026-08-24 07:15:23'),
('ml-dtd117v', 'mod-dtd117v', 'staff-lect-1', 1, 'staff-admin-1', '2026-08-12 12:19:35'),
('ml-isj107v', 'mod-isj107v', 'staff-lect-1', 1, 'staff-admin-1', '2026-08-12 12:19:35'),
('ml-sec117v', 'mod-sec117v', 'staff-lect-1', 1, 'staff-admin-1', '2026-08-12 12:19:35');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` varchar(36) NOT NULL,
  `module_id` varchar(36) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `module_id`, `title`, `message`, `created_at`) VALUES
('1004', 'mod-isj107v', 'Assignment 1 deadline extended', 'The deadline has been extended to 10 March.', '2026-08-12 12:19:35');

-- --------------------------------------------------------

--
-- Table structure for table `predictions`
--

CREATE TABLE `predictions` (
  `id` varchar(36) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `module_id` varchar(36) DEFAULT NULL,
  `predicted_grade` varchar(10) DEFAULT NULL,
  `risk_level` enum('low','medium','high') NOT NULL,
  `confidence` int(11) NOT NULL,
  `attendance` int(11) NOT NULL DEFAULT 0,
  `assignments` int(11) NOT NULL DEFAULT 0,
  `tests` int(11) NOT NULL DEFAULT 0,
  `recommendations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`recommendations`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `predictions`
--

INSERT INTO `predictions` (`id`, `student_id`, `module_id`, `predicted_grade`, `risk_level`, `confidence`, `attendance`, `assignments`, `tests`, `recommendations`, `created_at`) VALUES
('pred-001', 'student-1', 'mod-isj107v', 'A', 'low', 81, 100, 88, 78, '[\"Maintain current attendance\", \"Continue submitting assignments on time\"]', '2026-08-12 12:19:35');

-- --------------------------------------------------------

--
-- Table structure for table `ratings`
--

CREATE TABLE `ratings` (
  `session_id` varchar(36) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `rating` int(11) NOT NULL,
  `feedback` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `ratings`
--

INSERT INTO `ratings` (`session_id`, `student_id`, `rating`, `feedback`) VALUES
('s-1', 'student-1', 4, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `results`
--

CREATE TABLE `results` (
  `id` int(11) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `category` enum('CT','WR','AS','EXAM','OTHER') NOT NULL,
  `title` varchar(255) NOT NULL,
  `mark` decimal(5,2) NOT NULL,
  `out_of` decimal(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `results`
--

INSERT INTO `results` (`id`, `student_id`, `module_id`, `category`, `title`, `mark`, `out_of`) VALUES
(1, 'student-1', 'mod-isj107v', 'CT', 'Class Test 1', 78.00, 100.00),
(2, 'student-1', 'mod-isj107v', 'AS', 'Assignment 1', 88.00, 100.00),
(3, 'student-1', 'mod-sec117v', 'WR', 'Written Test 1', 74.00, 100.00),
(4, 'student-1', 'mod-dtd117v', 'CT', 'Class Test 1', 65.00, 100.00);

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` varchar(36) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `lecturer_id` varchar(36) NOT NULL,
  `session_date` date NOT NULL,
  `time_slot` varchar(100) DEFAULT NULL,
  `topic` varchar(255) NOT NULL,
  `attendance_code` varchar(255) DEFAULT NULL,
  `code_expires_at` datetime DEFAULT NULL,
  `expiry_minutes` int(11) DEFAULT 15,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`id`, `module_id`, `lecturer_id`, `session_date`, `time_slot`, `topic`, `attendance_code`, `code_expires_at`, `expiry_minutes`, `created_at`) VALUES
('s-1', 'mod-isj107v', 'staff-lect-1', '2026-07-20', '08:00–09:30', 'Requirements gathering & scoping', NULL, NULL, 15, '2026-08-12 12:19:35'),
('s-2', 'mod-isj107v', 'staff-lect-1', '2026-07-22', '10:00–11:30', 'System integration patterns', NULL, NULL, 15, '2026-08-12 12:19:35'),
('s-3', 'mod-sec117v', 'staff-lect-1', '2026-07-21', '12:00–13:30', 'REST vs SOAP services', NULL, NULL, 15, '2026-08-12 12:19:35'),
('s-4', 'mod-dtd117v', 'staff-lect-1', '2026-07-23', '09:00–10:30', 'Binary search trees', NULL, NULL, 15, '2026-08-12 12:19:35');

-- --------------------------------------------------------

--
-- Table structure for table `staff`
--

CREATE TABLE `staff` (
  `id` varchar(36) NOT NULL,
  `staff_number` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('lecturer','admin') NOT NULL,
  `faculty` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `title` varchar(100) DEFAULT NULL,
  `profile_image` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `staff`
--

INSERT INTO `staff` (`id`, `staff_number`, `name`, `email`, `password`, `role`, `faculty`, `department`, `title`, `profile_image`, `status`, `created_at`, `updated_at`) VALUES
('6531ccd1-2353-49fe-8d06-0958e2abb832', 'STF-1787555451452', 'Prof Khoza', 'khoza@tut.ac.za', 'lule', 'lecturer', NULL, NULL, NULL, NULL, 'approved', '2026-08-24 07:10:51', '2026-08-24 07:10:51'),
('staff-admin-1', '100045677', 'Thandi Nkosi', 'admin@tut.ac.za', 'password123', 'admin', 'Administration', 'Information Technology', 'Administrator', NULL, 'approved', '2026-08-12 12:19:35', '2026-08-12 12:19:35'),
('staff-lect-1', '100045678', 'Dr. S. Khumalo', 'khumalo@tut.ac.za', 'password123', 'lecturer', 'Faculty of Information Technology', 'Computer Science', 'Senior Lecturer', NULL, 'approved', '2026-08-12 12:19:35', '2026-08-12 12:19:35'),
('staff-lect-2', '100045680', 'Mr. T. Mokoena', 't.mokoena@tut.ac.za', 'password123', 'lecturer', 'Faculty of Information Technology', 'Computer Science', 'Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-3', '100045681', 'Ms. N. Dlamini', 'n.dlamini@tut.ac.za', 'password123', 'lecturer', 'Faculty of Information Technology', 'Software Engineering', 'Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-4', '100045682', 'Prof. R. van der Merwe', 'r.vandermerwe@tut.ac.za', 'password123', 'lecturer', 'Faculty of Information Technology', 'Computer Science', 'Head of Department', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-5', '100045683', 'Mr. K. Sithole', 'k.sithole@tut.ac.za', 'password123', 'lecturer', 'Faculty of Information Technology', 'Networking', 'Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-6', '100045684', 'Ms. P. Nkosi', 'p.nkosi@tut.ac.za', 'password123', 'lecturer', 'Faculty of Management Sciences', 'Business Information Systems', 'Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-7', '100045685', 'Mr. J. Botha', 'j.botha@tut.ac.za', 'password123', 'lecturer', 'Faculty of Management Sciences', 'Accounting', 'Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50'),
('staff-lect-8', '100045686', 'Dr. L. Mahlangu', 'l.mahlangu@tut.ac.za', 'password123', 'lecturer', 'Faculty of Management Sciences', 'Economics', 'Senior Lecturer', NULL, 'approved', '2026-08-26 12:37:50', '2026-08-26 12:37:50');

-- --------------------------------------------------------

--
-- Table structure for table `students`
--

CREATE TABLE `students` (
  `id` varchar(36) NOT NULL,
  `student_number` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `faculty` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `profile_image` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `students`
--

INSERT INTO `students` (`id`, `student_number`, `name`, `password`, `email`, `faculty`, `department`, `year`, `profile_image`, `status`, `created_at`, `updated_at`) VALUES
('student-1', '219524579', 'S. Mathebula', 'password123', '219524579@tut4life.ac.za', 'Faculty of Information Technology', 'Computer Science', 3, NULL, 'approved', '2026-08-12 12:19:35', '2026-08-12 12:19:35'),
('student-2', '219524580', 'K. Dlamini', 'password123', '219524580@tut4life.ac.za', 'Faculty of Information Technology', 'Computer Science', 3, NULL, 'approved', '2026-08-12 12:19:35', '2026-08-12 12:19:35'),
('student-3', '219524581', 'T. Sithole', 'password123', '219524581@tut4life.ac.za', 'Faculty of Information Technology', 'Computer Science', 3, NULL, 'approved', '2026-08-12 12:19:35', '2026-08-12 12:19:35');

-- --------------------------------------------------------

--
-- Table structure for table `timetable`
--

CREATE TABLE `timetable` (
  `id` int(11) NOT NULL,
  `module_id` varchar(36) NOT NULL,
  `day` varchar(20) NOT NULL,
  `time` varchar(50) NOT NULL,
  `venue` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `timetable`
--

INSERT INTO `timetable` (`id`, `module_id`, `day`, `time`, `venue`) VALUES
(1, 'mod-isj107v', 'Monday', '08:00–09:30', 'IT Lab 2'),
(2, 'mod-isj107v', 'Wednesday', '10:00–11:30', 'IT Lab 2'),
(3, 'mod-sec117v', 'Tuesday', '12:00–13:30', 'Room 4.12'),
(4, 'mod-dtd117v', 'Thursday', '09:00–10:30', 'Room 2.05');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `assignments`
--
ALTER TABLE `assignments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `module_id` (`module_id`);

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `session_id` (`session_id`,`student_id`),
  ADD KEY `student_id` (`student_id`);

--
-- Indexes for table `courses`
--
ALTER TABLE `courses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_course_code` (`code`);

--
-- Indexes for table `course_modules`
--
ALTER TABLE `course_modules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_course_module` (`course_id`,`module_id`),
  ADD KEY `fk_cm_module` (`module_id`);

--
-- Indexes for table `enrolments`
--
ALTER TABLE `enrolments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `student_id` (`student_id`,`module_id`),
  ADD KEY `module_id` (`module_id`);

--
-- Indexes for table `modules`
--
ALTER TABLE `modules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `module_lecturers`
--
ALTER TABLE `module_lecturers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `module_id` (`module_id`,`lecturer_id`),
  ADD KEY `lecturer_id` (`lecturer_id`),
  ADD KEY `assigned_by` (`assigned_by`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `module_id` (`module_id`);

--
-- Indexes for table `predictions`
--
ALTER TABLE `predictions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `student_id` (`student_id`),
  ADD KEY `module_id` (`module_id`);

--
-- Indexes for table `ratings`
--
ALTER TABLE `ratings`
  ADD PRIMARY KEY (`session_id`,`student_id`),
  ADD KEY `student_id` (`student_id`);

--
-- Indexes for table `results`
--
ALTER TABLE `results`
  ADD PRIMARY KEY (`id`),
  ADD KEY `student_id` (`student_id`),
  ADD KEY `module_id` (`module_id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `module_id` (`module_id`),
  ADD KEY `lecturer_id` (`lecturer_id`);

--
-- Indexes for table `staff`
--
ALTER TABLE `staff`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_number` (`staff_number`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `students`
--
ALTER TABLE `students`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `student_number` (`student_number`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `timetable`
--
ALTER TABLE `timetable`
  ADD PRIMARY KEY (`id`),
  ADD KEY `module_id` (`module_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `enrolments`
--
ALTER TABLE `enrolments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `results`
--
ALTER TABLE `results`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `timetable`
--
ALTER TABLE `timetable`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `assignments`
--
ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `attendance`
--
ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `course_modules`
--
ALTER TABLE `course_modules`
  ADD CONSTRAINT `fk_cm_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cm_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `enrolments`
--
ALTER TABLE `enrolments`
  ADD CONSTRAINT `enrolments_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `enrolments_ibfk_2` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `modules`
--
ALTER TABLE `modules`
  ADD CONSTRAINT `modules_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `staff` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `module_lecturers`
--
ALTER TABLE `module_lecturers`
  ADD CONSTRAINT `module_lecturers_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `module_lecturers_ibfk_2` FOREIGN KEY (`lecturer_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `module_lecturers_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `staff` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `predictions`
--
ALTER TABLE `predictions`
  ADD CONSTRAINT `predictions_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `predictions_ibfk_2` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ratings`
--
ALTER TABLE `ratings`
  ADD CONSTRAINT `ratings_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `ratings_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `results`
--
ALTER TABLE `results`
  ADD CONSTRAINT `results_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `results_ibfk_2` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `sessions_ibfk_2` FOREIGN KEY (`lecturer_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `timetable`
--
ALTER TABLE `timetable`
  ADD CONSTRAINT `timetable_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

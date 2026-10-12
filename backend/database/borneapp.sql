-- MySQL dump 10.13  Distrib 9.5.0, for macos26.1 (arm64)
--
-- Host: localhost    Database: borneapp
-- ------------------------------------------------------
-- Server version	9.5.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'bcfaacd6-d606-11f0-9a15-b535eaf40b58:1-15207';

--
-- Table structure for table `alertes`
--

DROP TABLE IF EXISTS `alertes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alertes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `borne_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gravite` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'warning',
  `message` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resolue` tinyint(1) NOT NULL DEFAULT '0',
  `resolue_le` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alertes_borne_id_foreign` (`borne_id`),
  KEY `alertes_resolue_created_at_index` (`resolue`,`created_at`),
  CONSTRAINT `alertes_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alertes`
--

LOCK TABLES `alertes` WRITE;
/*!40000 ALTER TABLE `alertes` DISABLE KEYS */;
/*!40000 ALTER TABLE `alertes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cible` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `ip` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `audit_logs_user_id_foreign` (`user_id`),
  KEY `audit_logs_created_at_index` (`created_at`),
  CONSTRAINT `audit_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,1,'connexion','user:1',NULL,'127.0.0.1','2026-09-30 12:31:33','2026-09-30 12:31:33'),(2,1,'connexion','user:1',NULL,'192.168.1.119','2026-09-30 12:51:31','2026-09-30 12:51:31');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `badges_rfid`
--

DROP TABLE IF EXISTS `badges_rfid`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `badges_rfid` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `uid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `date_expiration` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `badges_rfid_uid_unique` (`uid`),
  KEY `badges_rfid_user_id_foreign` (`user_id`),
  CONSTRAINT `badges_rfid_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `badges_rfid`
--

LOCK TABLES `badges_rfid` WRITE;
/*!40000 ALTER TABLE `badges_rfid` DISABLE KEYS */;
INSERT INTO `badges_rfid` VALUES (1,1,'A4:5F:22:9C',1,'2027-01-01','2026-09-30 12:14:46','2026-09-30 12:14:46');
/*!40000 ALTER TABLE `badges_rfid` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bornes`
--

DROP TABLE IF EXISTS `bornes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bornes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reseau',
  `source_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero_serie` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modele` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fabricant` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operateur` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adresse` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `version_firmware` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version_ocpp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `puissance_kw` smallint unsigned DEFAULT NULL,
  `etat` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disponible',
  `dernier_heartbeat` timestamp NULL DEFAULT NULL,
  `temperature_c` decimal(5,2) DEFAULT NULL,
  `tarif_kwh` decimal(8,3) NOT NULL DEFAULT '0.000',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bornes_reference_unique` (`reference`),
  UNIQUE KEY `bornes_numero_serie_unique` (`numero_serie`),
  UNIQUE KEY `bornes_source_id_unique` (`source_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bornes`
--

LOCK TABLES `bornes` WRITE;
/*!40000 ALTER TABLE `bornes` DISABLE KEYS */;
INSERT INTO `bornes` VALUES (1,'reseau',NULL,'Borne Lac 1','BRN-TUN-001','SN-88412-A','Terra AC W22','ABB',NULL,'Rue du Lac Turkana, Les Berges du Lac, Tunis',36.8324000,10.2331000,'1.8.2','1.6',22,'disponible','2026-10-03 21:14:55',31.00,0.450,'2026-09-30 12:14:46','2026-10-03 21:14:55'),(2,'reseau',NULL,'Borne Centre Urbain Nord','BRN-TUN-002','SN-88413-B','Supernova 60','Wallbox',NULL,'Centre Urbain Nord, Tunis',36.8508000,10.1897000,'2.1.0','2.0.1',60,'disponible','2026-10-03 21:14:55',38.00,0.620,'2026-09-30 12:14:46','2026-10-03 21:14:55'),(3,'reseau',NULL,'Borne La Marsa Plage','BRN-TUN-003','SN-88414-C','Terra 54','ABB',NULL,'Avenue Habib Bourguiba, La Marsa',36.8781000,10.3247000,'1.7.9','1.6',50,'maintenance','2026-09-30 11:14:46',29.00,0.580,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(4,'reseau',NULL,'Borne Sousse Corniche','BRN-SOU-001','SN-91201-A','EVBox Troniq 100','EVBox',NULL,'Boulevard de la Corniche, Sousse',35.8256000,10.6084000,'3.0.1','2.0.1',100,'disponible','2026-10-03 21:14:55',33.00,0.700,'2026-09-30 12:14:46','2026-10-03 21:14:55'),(5,'reseau',NULL,'Borne Sfax Centre','BRN-SFX-001','SN-91355-D','Terra AC W7','ABB',NULL,'Avenue Hédi Chaker, Sfax',34.7406000,10.7603000,'1.8.2','1.6',7,'deconnectee','2026-09-29 12:14:46',NULL,0.400,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(6,'publique','osm:node/4510850190','Borne de recharge publique','PUB-OSM-N4510850190',NULL,NULL,NULL,NULL,'Avenue de Bellevue, Sidi Belhassen, Tunis',36.7807266,10.1937043,NULL,NULL,NULL,'inconnu',NULL,NULL,0.000,'2026-09-30 12:30:10','2026-09-30 12:30:10'),(7,'publique','osm:node/12449852375','Charging Station Total Kortoba','PUB-OSM-N12449852375',NULL,NULL,NULL,'TotalEnergies','Route Nationale Tunis - Ras Jedir, Gouvernorat Sfax',34.8391928,10.7647117,NULL,NULL,NULL,'inconnu',NULL,NULL,0.000,'2026-09-30 12:30:10','2026-09-30 12:30:10'),(8,'publique','osm:node/14115356211','Borne recharge électrique Kia Monastir','PUB-OSM-N14115356211',NULL,NULL,NULL,NULL,'Gouvernorat Monastir',35.7451197,10.8230832,NULL,NULL,NULL,'inconnu',NULL,NULL,0.000,'2026-09-30 12:30:10','2026-09-30 12:30:10'),(9,'publique','osm:node/14115363187','Borne de recharge électrique Marina Monastir','PUB-OSM-N14115363187',NULL,NULL,NULL,NULL,'Gouvernorat Monastir',35.7812856,10.8328179,NULL,NULL,NULL,'inconnu',NULL,NULL,0.000,'2026-09-30 12:30:10','2026-09-30 12:30:10'),(10,'publique','osm:way/1159157858','Shell sidi hassine 2','PUB-OSM-W1159157858',NULL,NULL,NULL,'Shell','Attar, Tunis',36.7643006,10.1192249,NULL,NULL,NULL,'inconnu',NULL,NULL,0.000,'2026-09-30 12:30:10','2026-09-30 12:30:10');
/*!40000 ALTER TABLE `bornes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache`
--

DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache`
--

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_locks`
--

DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_locks`
--

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `connecteurs`
--

DROP TABLE IF EXISTS `connecteurs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `connecteurs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `borne_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `puissance_kw` smallint unsigned NOT NULL,
  `etat` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disponible',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `connecteurs_borne_id_foreign` (`borne_id`),
  CONSTRAINT `connecteurs_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `connecteurs`
--

LOCK TABLES `connecteurs` WRITE;
/*!40000 ALTER TABLE `connecteurs` DISABLE KEYS */;
INSERT INTO `connecteurs` VALUES (1,1,'Type2',22,'disponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(2,1,'Type2',22,'disponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(3,2,'CCS',60,'disponible','2026-09-30 12:14:46','2026-09-30 12:37:31'),(4,2,'CHAdeMO',50,'disponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(5,3,'CCS',50,'indisponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(6,3,'Type2',22,'indisponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(7,4,'CCS',100,'disponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(8,4,'CHAdeMO',62,'disponible','2026-09-30 12:14:46','2026-09-30 12:14:46'),(9,5,'AC',7,'indisponible','2026-09-30 12:14:46','2026-09-30 12:14:46');
/*!40000 ALTER TABLE `connecteurs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `factures`
--

DROP TABLE IF EXISTS `factures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `factures` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_recharge_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `numero` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `montant_ttc` decimal(10,2) NOT NULL,
  `chemin_pdf` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `factures_numero_unique` (`numero`),
  KEY `factures_session_recharge_id_foreign` (`session_recharge_id`),
  KEY `factures_user_id_foreign` (`user_id`),
  CONSTRAINT `factures_session_recharge_id_foreign` FOREIGN KEY (`session_recharge_id`) REFERENCES `sessions_recharge` (`id`) ON DELETE CASCADE,
  CONSTRAINT `factures_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `factures`
--

LOCK TABLES `factures` WRITE;
/*!40000 ALTER TABLE `factures` DISABLE KEYS */;
INSERT INTO `factures` VALUES (1,1,1,'FAC-2026-0001','2026-09-27',21.86,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(2,2,1,'FAC-2026-0002','2026-09-21',14.89,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(3,3,1,'FAC-2026-0003','2026-09-13',26.51,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(4,5,1,'FAC-2026-0005','2026-08-28',20.47,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(5,6,1,'FAC-2026-0006','2026-08-20',28.79,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(6,7,1,'FAC-2026-0007','2026-08-06',16.24,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(7,8,1,'FAC-2026-0008','2026-07-22',20.70,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(8,9,1,'FAC-2026-0009','2026-07-04',23.30,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(9,10,1,'FAC-2026-0010','2026-06-18',16.35,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(10,11,1,'FAC-2026-0011','2026-05-23',24.35,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(11,12,1,'FAC-2026-0012','2026-05-03',25.47,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(12,13,1,'FAC-2026-0013','2026-09-30',1.87,NULL,'2026-09-30 12:37:31','2026-09-30 12:37:31');
/*!40000 ALTER TABLE `factures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`),
  KEY `failed_jobs_connection_queue_failed_at_index` (`connection`,`queue`,`failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `failed_jobs`
--

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favoris`
--

DROP TABLE IF EXISTS `favoris`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favoris` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `borne_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `favoris_user_id_borne_id_unique` (`user_id`,`borne_id`),
  KEY `favoris_borne_id_foreign` (`borne_id`),
  CONSTRAINT `favoris_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `favoris_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favoris`
--

LOCK TABLES `favoris` WRITE;
/*!40000 ALTER TABLE `favoris` DISABLE KEYS */;
/*!40000 ALTER TABLE `favoris` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_batches`
--

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` smallint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenances`
--

DROP TABLE IF EXISTS `maintenances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `borne_id` bigint unsigned NOT NULL,
  `technicien_id` bigint unsigned DEFAULT NULL,
  `statut` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planifiee',
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_prevue` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `maintenances_borne_id_foreign` (`borne_id`),
  KEY `maintenances_technicien_id_foreign` (`technicien_id`),
  CONSTRAINT `maintenances_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `maintenances_technicien_id_foreign` FOREIGN KEY (`technicien_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenances`
--

LOCK TABLES `maintenances` WRITE;
/*!40000 ALTER TABLE `maintenances` DISABLE KEYS */;
/*!40000 ALTER TABLE `maintenances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mesures_recharge`
--

DROP TABLE IF EXISTS `mesures_recharge`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mesures_recharge` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_recharge_id` bigint unsigned NOT NULL,
  `horodatage` timestamp NOT NULL,
  `energie_kwh` decimal(10,3) NOT NULL,
  `puissance_kw` decimal(8,2) DEFAULT NULL,
  `pourcentage_batterie` tinyint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mesures_recharge_session_recharge_id_horodatage_index` (`session_recharge_id`,`horodatage`),
  CONSTRAINT `mesures_recharge_session_recharge_id_foreign` FOREIGN KEY (`session_recharge_id`) REFERENCES `sessions_recharge` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=357 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mesures_recharge`
--

LOCK TABLES `mesures_recharge` WRITE;
/*!40000 ALTER TABLE `mesures_recharge` DISABLE KEYS */;
INSERT INTO `mesures_recharge` VALUES (1,1,'2026-09-27 17:40:00',0.910,54.50,23),(2,1,'2026-09-27 17:42:00',2.730,54.60,26),(3,1,'2026-09-27 17:44:00',4.530,53.90,29),(4,1,'2026-09-27 17:46:00',6.370,54.20,32),(5,1,'2026-09-27 17:48:00',8.190,54.40,35),(6,1,'2026-09-27 17:50:00',10.020,54.90,38),(7,1,'2026-09-27 17:52:00',11.880,55.10,41),(8,1,'2026-09-27 17:54:00',13.690,54.50,44),(9,1,'2026-09-27 17:56:00',15.540,54.50,47),(10,1,'2026-09-27 17:58:00',17.370,53.80,50),(11,1,'2026-09-27 18:00:00',19.250,55.90,54),(12,1,'2026-09-27 18:02:00',21.100,55.20,57),(13,1,'2026-09-27 18:04:00',22.830,52.20,60),(14,1,'2026-09-27 18:06:00',24.460,47.30,62),(15,1,'2026-09-27 18:08:00',26.050,47.30,65),(16,1,'2026-09-27 18:10:00',27.500,42.60,67),(17,1,'2026-09-27 18:12:00',28.890,40.60,70),(18,1,'2026-09-27 18:14:00',30.190,38.90,72),(19,1,'2026-09-27 18:16:00',31.420,36.30,74),(20,1,'2026-09-27 18:18:00',32.590,33.90,76),(21,1,'2026-09-27 18:20:00',33.730,33.40,78),(22,1,'2026-09-27 18:22:00',34.770,30.70,79),(23,2,'2026-09-21 07:15:00',0.340,20.50,35),(24,2,'2026-09-21 07:17:00',1.040,20.70,36),(25,2,'2026-09-21 07:19:00',1.720,20.60,37),(26,2,'2026-09-21 07:21:00',2.420,21.50,39),(27,2,'2026-09-21 07:23:00',3.130,21.30,40),(28,2,'2026-09-21 07:25:00',3.820,21.30,41),(29,2,'2026-09-21 07:27:00',4.510,20.50,42),(30,2,'2026-09-21 07:29:00',5.210,20.70,43),(31,2,'2026-09-21 07:31:00',5.890,20.40,44),(32,2,'2026-09-21 07:33:00',6.580,20.50,45),(33,2,'2026-09-21 07:35:00',7.280,21.20,47),(34,2,'2026-09-21 07:37:00',7.980,20.70,48),(35,2,'2026-09-21 07:39:00',8.680,20.90,49),(36,2,'2026-09-21 07:41:00',9.370,21.10,50),(37,2,'2026-09-21 07:43:00',10.070,20.40,51),(38,2,'2026-09-21 07:45:00',10.750,20.40,52),(39,2,'2026-09-21 07:47:00',11.440,20.80,54),(40,2,'2026-09-21 07:49:00',12.130,20.30,55),(41,2,'2026-09-21 07:51:00',12.820,21.20,56),(42,2,'2026-09-21 07:53:00',13.530,21.30,57),(43,2,'2026-09-21 07:55:00',14.220,20.60,58),(44,2,'2026-09-21 07:57:00',14.920,21.50,59),(45,2,'2026-09-21 07:59:00',15.630,21.30,61),(46,2,'2026-09-21 08:01:00',16.320,20.50,62),(47,2,'2026-09-21 08:03:00',17.000,20.40,63),(48,2,'2026-09-21 08:05:00',17.710,21.00,64),(49,2,'2026-09-21 08:07:00',18.410,21.20,65),(50,2,'2026-09-21 08:09:00',19.120,21.20,66),(51,2,'2026-09-21 08:11:00',19.810,20.40,68),(52,2,'2026-09-21 08:13:00',20.510,21.40,69),(53,2,'2026-09-21 08:15:00',21.220,21.20,70),(54,2,'2026-09-21 08:17:00',21.920,21.40,71),(55,2,'2026-09-21 08:19:00',22.620,21.40,72),(56,2,'2026-09-21 08:21:00',23.310,20.60,73),(57,2,'2026-09-21 08:23:00',24.000,20.50,75),(58,2,'2026-09-21 08:25:00',24.710,21.50,76),(59,2,'2026-09-21 08:27:00',25.400,21.10,77),(60,2,'2026-09-21 08:29:00',26.100,21.00,78),(61,2,'2026-09-21 08:31:00',26.780,20.50,79),(62,2,'2026-09-21 08:33:00',27.470,20.40,80),(63,2,'2026-09-21 08:35:00',28.170,21.30,81),(64,2,'2026-09-21 08:37:00',28.870,21.30,83),(65,2,'2026-09-21 08:39:00',29.570,20.70,84),(66,2,'2026-09-21 08:41:00',30.280,21.10,85),(67,2,'2026-09-21 08:43:00',30.980,21.50,86),(68,2,'2026-09-21 08:45:00',31.700,21.40,87),(69,2,'2026-09-21 08:47:00',32.400,20.60,88),(70,2,'2026-09-21 08:49:00',33.090,20.40,90),(71,3,'2026-09-13 12:05:00',1.550,92.70,20),(72,3,'2026-09-13 12:07:00',4.660,93.50,25),(73,3,'2026-09-13 12:09:00',7.700,89.40,30),(74,3,'2026-09-13 12:11:00',10.770,91.90,35),(75,3,'2026-09-13 12:13:00',13.750,89.20,40),(76,3,'2026-09-13 12:15:00',16.870,93.70,46),(77,3,'2026-09-13 12:17:00',19.950,91.00,51),(78,3,'2026-09-13 12:19:00',23.000,90.30,56),(79,3,'2026-09-13 12:21:00',25.910,85.40,61),(80,3,'2026-09-13 12:23:00',28.570,78.70,65),(81,3,'2026-09-13 12:25:00',31.000,71.60,69),(82,3,'2026-09-13 12:27:00',33.180,62.90,73),(83,3,'2026-09-13 12:29:00',35.190,57.20,76),(84,3,'2026-09-13 12:31:00',37.020,54.30,79),(85,4,'2026-09-06 18:30:00',0.340,20.60,50),(86,4,'2026-09-06 18:32:00',1.030,20.70,51),(87,4,'2026-09-06 18:34:00',1.730,20.90,52),(88,4,'2026-09-06 18:36:00',2.440,21.30,54),(89,4,'2026-09-06 18:38:00',3.130,20.30,55),(90,4,'2026-09-06 18:40:00',3.820,20.40,56),(91,4,'2026-09-06 18:42:00',4.520,20.90,57),(92,5,'2026-08-28 09:12:00',0.930,56.10,31),(93,5,'2026-08-28 09:14:00',2.800,55.30,34),(94,5,'2026-08-28 09:16:00',4.630,55.00,37),(95,5,'2026-08-28 09:18:00',6.470,56.50,40),(96,5,'2026-08-28 09:20:00',8.330,56.20,43),(97,5,'2026-08-28 09:22:00',10.160,55.60,46),(98,5,'2026-08-28 09:24:00',12.020,55.80,50),(99,5,'2026-08-28 09:26:00',13.870,55.60,53),(100,5,'2026-08-28 09:28:00',15.690,53.90,56),(101,5,'2026-08-28 09:30:00',17.500,54.10,59),(102,5,'2026-08-28 09:32:00',19.190,48.70,61),(103,5,'2026-08-28 09:34:00',20.810,48.00,64),(104,5,'2026-08-28 09:36:00',22.310,44.60,67),(105,5,'2026-08-28 09:38:00',23.710,41.50,69),(106,5,'2026-08-28 09:40:00',25.010,38.40,71),(107,5,'2026-08-28 09:42:00',26.300,38.30,73),(108,5,'2026-08-28 09:44:00',27.500,35.60,75),(109,5,'2026-08-28 09:46:00',28.630,34.30,77),(110,5,'2026-08-28 09:48:00',29.700,32.10,79),(111,5,'2026-08-28 09:50:00',30.720,30.10,81),(112,5,'2026-08-28 09:52:00',31.670,27.90,82),(113,5,'2026-08-28 09:54:00',32.580,27.30,84),(114,6,'2026-08-20 14:05:00',1.570,94.50,14),(115,6,'2026-08-20 14:07:00',4.630,91.70,19),(116,6,'2026-08-20 14:09:00',7.720,90.60,24),(117,6,'2026-08-20 14:11:00',10.750,92.60,29),(118,6,'2026-08-20 14:13:00',13.810,89.90,35),(119,6,'2026-08-20 14:15:00',16.880,94.30,40),(120,6,'2026-08-20 14:17:00',19.990,92.80,45),(121,6,'2026-08-20 14:19:00',23.010,91.30,50),(122,6,'2026-08-20 14:21:00',26.030,90.70,55),(123,6,'2026-08-20 14:23:00',29.010,89.10,60),(124,6,'2026-08-20 14:25:00',31.730,78.10,64),(125,6,'2026-08-20 14:27:00',34.160,70.70,68),(126,6,'2026-08-20 14:29:00',36.400,67.10,72),(127,6,'2026-08-20 14:31:00',38.420,59.20,76),(128,6,'2026-08-20 14:33:00',40.280,54.90,79),(129,7,'2026-08-06 08:00:00',0.340,20.40,40),(130,7,'2026-08-06 08:02:00',1.050,21.00,41),(131,7,'2026-08-06 08:04:00',1.750,21.30,42),(132,7,'2026-08-06 08:06:00',2.440,20.90,44),(133,7,'2026-08-06 08:08:00',3.130,20.40,45),(134,7,'2026-08-06 08:10:00',3.830,21.40,46),(135,7,'2026-08-06 08:12:00',4.530,21.40,47),(136,7,'2026-08-06 08:14:00',5.220,20.50,48),(137,7,'2026-08-06 08:16:00',5.910,20.80,49),(138,7,'2026-08-06 08:18:00',6.600,20.60,50),(139,7,'2026-08-06 08:20:00',7.300,21.40,52),(140,7,'2026-08-06 08:22:00',8.010,21.50,53),(141,7,'2026-08-06 08:24:00',8.720,21.40,54),(142,7,'2026-08-06 08:26:00',9.430,21.10,55),(143,7,'2026-08-06 08:28:00',10.120,20.90,56),(144,7,'2026-08-06 08:30:00',10.820,21.50,58),(145,7,'2026-08-06 08:32:00',11.510,20.30,59),(146,7,'2026-08-06 08:34:00',12.200,20.70,60),(147,7,'2026-08-06 08:36:00',12.890,20.80,61),(148,7,'2026-08-06 08:38:00',13.570,20.50,62),(149,7,'2026-08-06 08:40:00',14.280,21.30,63),(150,7,'2026-08-06 08:42:00',14.990,21.00,64),(151,7,'2026-08-06 08:44:00',15.700,21.20,66),(152,7,'2026-08-06 08:46:00',16.400,21.20,67),(153,7,'2026-08-06 08:48:00',17.120,21.40,68),(154,7,'2026-08-06 08:50:00',17.800,20.30,69),(155,7,'2026-08-06 08:52:00',18.500,21.40,70),(156,7,'2026-08-06 08:54:00',19.200,20.60,72),(157,7,'2026-08-06 08:56:00',19.900,20.50,73),(158,7,'2026-08-06 08:58:00',20.600,20.70,74),(159,7,'2026-08-06 09:00:00',21.290,20.50,75),(160,7,'2026-08-06 09:02:00',21.990,20.70,76),(161,7,'2026-08-06 09:04:00',22.670,20.60,77),(162,7,'2026-08-06 09:06:00',23.360,21.20,78),(163,7,'2026-08-06 09:08:00',24.050,20.70,80),(164,7,'2026-08-06 09:10:00',24.750,21.40,81),(165,7,'2026-08-06 09:12:00',25.440,20.80,82),(166,7,'2026-08-06 09:14:00',26.140,20.30,83),(167,7,'2026-08-06 09:16:00',26.820,20.40,84),(168,7,'2026-08-06 09:18:00',27.530,21.50,85),(169,7,'2026-08-06 09:20:00',28.240,21.30,87),(170,7,'2026-08-06 09:22:00',28.930,20.80,88),(171,7,'2026-08-06 09:24:00',29.630,21.50,89),(172,7,'2026-08-06 09:26:00',30.320,20.30,90),(173,7,'2026-08-06 09:28:00',31.030,20.90,91),(174,7,'2026-08-06 09:30:00',31.710,20.50,92),(175,7,'2026-08-06 09:32:00',32.430,21.30,94),(176,7,'2026-08-06 09:34:00',33.110,20.30,95),(177,7,'2026-08-06 09:36:00',33.790,20.40,96),(178,7,'2026-08-06 09:38:00',34.460,19.60,97),(179,7,'2026-08-06 09:40:00',35.120,20.10,98),(180,7,'2026-08-06 09:42:00',35.770,19.10,99),(181,8,'2026-07-22 16:45:00',0.790,47.20,26),(182,8,'2026-07-22 16:47:00',2.320,45.20,28),(183,8,'2026-07-22 16:49:00',3.840,45.60,31),(184,8,'2026-07-22 16:51:00',5.380,46.40,33),(185,8,'2026-07-22 16:53:00',6.900,46.10,36),(186,8,'2026-07-22 16:55:00',8.400,45.00,39),(187,8,'2026-07-22 16:57:00',9.970,47.00,41),(188,8,'2026-07-22 16:59:00',11.510,46.20,44),(189,8,'2026-07-22 17:01:00',13.080,46.50,46),(190,8,'2026-07-22 17:03:00',14.600,44.70,49),(191,8,'2026-07-22 17:05:00',16.160,46.80,51),(192,8,'2026-07-22 17:07:00',17.690,46.20,54),(193,8,'2026-07-22 17:09:00',19.230,46.20,57),(194,8,'2026-07-22 17:11:00',20.680,42.60,59),(195,8,'2026-07-22 17:13:00',22.090,42.00,61),(196,8,'2026-07-22 17:15:00',23.420,39.60,64),(197,8,'2026-07-22 17:17:00',24.690,37.00,66),(198,8,'2026-07-22 17:19:00',25.900,36.50,68),(199,8,'2026-07-22 17:21:00',27.050,33.60,70),(200,8,'2026-07-22 17:23:00',28.180,33.60,71),(201,8,'2026-07-22 17:25:00',29.230,31.80,73),(202,8,'2026-07-22 17:27:00',30.220,28.90,75),(203,8,'2026-07-22 17:29:00',31.180,28.50,76),(204,8,'2026-07-22 17:31:00',32.100,27.60,78),(205,8,'2026-07-22 17:33:00',32.980,26.30,79),(206,9,'2026-07-04 11:20:00',0.940,56.50,21),(207,9,'2026-07-04 11:22:00',2.830,57.10,24),(208,9,'2026-07-04 11:24:00',4.750,58.00,27),(209,9,'2026-07-04 11:26:00',6.610,55.70,31),(210,9,'2026-07-04 11:28:00',8.500,56.00,34),(211,9,'2026-07-04 11:30:00',10.440,58.70,37),(212,9,'2026-07-04 11:32:00',12.340,56.30,40),(213,9,'2026-07-04 11:34:00',14.270,58.10,43),(214,9,'2026-07-04 11:36:00',16.120,55.80,46),(215,9,'2026-07-04 11:38:00',18.000,56.00,49),(216,9,'2026-07-04 11:40:00',19.930,58.00,53),(217,9,'2026-07-04 11:42:00',21.830,56.00,56),(218,9,'2026-07-04 11:44:00',23.660,53.20,59),(219,9,'2026-07-04 11:46:00',25.400,51.80,62),(220,9,'2026-07-04 11:48:00',27.040,48.10,65),(221,9,'2026-07-04 11:50:00',28.600,46.60,67),(222,9,'2026-07-04 11:52:00',30.050,42.50,70),(223,9,'2026-07-04 11:54:00',31.400,40.70,72),(224,9,'2026-07-04 11:56:00',32.690,37.20,74),(225,10,'2026-06-18 19:10:00',0.340,20.60,30),(226,10,'2026-06-18 19:12:00',1.050,21.20,31),(227,10,'2026-06-18 19:14:00',1.760,20.70,32),(228,10,'2026-06-18 19:16:00',2.470,21.50,34),(229,10,'2026-06-18 19:18:00',3.170,21.20,35),(230,10,'2026-06-18 19:20:00',3.860,21.00,36),(231,10,'2026-06-18 19:22:00',4.560,21.30,37),(232,10,'2026-06-18 19:24:00',5.270,21.20,38),(233,10,'2026-06-18 19:26:00',5.970,21.00,39),(234,10,'2026-06-18 19:28:00',6.660,20.30,41),(235,10,'2026-06-18 19:30:00',7.360,20.60,42),(236,10,'2026-06-18 19:32:00',8.050,20.60,43),(237,10,'2026-06-18 19:34:00',8.760,21.00,44),(238,10,'2026-06-18 19:36:00',9.470,21.40,45),(239,10,'2026-06-18 19:38:00',10.180,21.50,46),(240,10,'2026-06-18 19:40:00',10.870,20.50,48),(241,10,'2026-06-18 19:42:00',11.550,20.40,49),(242,10,'2026-06-18 19:44:00',12.240,20.90,50),(243,10,'2026-06-18 19:46:00',12.920,20.40,51),(244,10,'2026-06-18 19:48:00',13.630,20.70,52),(245,10,'2026-06-18 19:50:00',14.330,20.90,53),(246,10,'2026-06-18 19:52:00',15.040,21.00,55),(247,10,'2026-06-18 19:54:00',15.730,21.00,56),(248,10,'2026-06-18 19:56:00',16.430,21.30,57),(249,10,'2026-06-18 19:58:00',17.120,21.20,58),(250,10,'2026-06-18 20:00:00',17.810,21.00,59),(251,10,'2026-06-18 20:02:00',18.510,20.60,60),(252,10,'2026-06-18 20:04:00',19.210,21.00,62),(253,10,'2026-06-18 20:06:00',19.920,21.20,63),(254,10,'2026-06-18 20:08:00',20.620,21.50,64),(255,10,'2026-06-18 20:10:00',21.320,20.70,65),(256,10,'2026-06-18 20:12:00',22.010,21.40,66),(257,10,'2026-06-18 20:14:00',22.720,21.30,67),(258,10,'2026-06-18 20:16:00',23.420,20.90,69),(259,10,'2026-06-18 20:18:00',24.120,20.70,70),(260,10,'2026-06-18 20:20:00',24.820,21.50,71),(261,10,'2026-06-18 20:22:00',25.530,21.30,72),(262,10,'2026-06-18 20:24:00',26.220,20.80,73),(263,10,'2026-06-18 20:26:00',26.930,21.30,74),(264,10,'2026-06-18 20:28:00',27.620,20.30,76),(265,10,'2026-06-18 20:30:00',28.320,21.00,77),(266,10,'2026-06-18 20:32:00',29.040,21.30,78),(267,10,'2026-06-18 20:34:00',29.740,21.20,79),(268,10,'2026-06-18 20:36:00',30.440,21.10,80),(269,10,'2026-06-18 20:38:00',31.140,21.40,81),(270,10,'2026-06-18 20:40:00',31.830,20.50,83),(271,10,'2026-06-18 20:42:00',32.520,20.80,84),(272,10,'2026-06-18 20:44:00',33.210,21.10,85),(273,10,'2026-06-18 20:46:00',33.920,21.50,86),(274,10,'2026-06-18 20:48:00',34.610,20.30,87),(275,10,'2026-06-18 20:50:00',35.300,21.10,88),(276,10,'2026-06-18 20:52:00',35.980,20.70,89),(277,11,'2026-05-23 10:30:00',0.900,53.80,16),(278,11,'2026-05-23 10:32:00',2.750,55.30,19),(279,11,'2026-05-23 10:34:00',4.580,54.90,22),(280,11,'2026-05-23 10:36:00',6.450,56.00,25),(281,11,'2026-05-23 10:38:00',8.310,55.80,28),(282,11,'2026-05-23 10:40:00',10.120,54.70,31),(283,11,'2026-05-23 10:42:00',11.970,55.90,34),(284,11,'2026-05-23 10:44:00',13.820,54.50,38),(285,11,'2026-05-23 10:46:00',15.670,55.50,41),(286,11,'2026-05-23 10:48:00',17.520,56.10,44),(287,11,'2026-05-23 10:50:00',19.370,54.90,47),(288,11,'2026-05-23 10:52:00',21.190,55.10,50),(289,11,'2026-05-23 10:54:00',23.010,55.10,53),(290,11,'2026-05-23 10:56:00',24.850,55.30,56),(291,11,'2026-05-23 10:58:00',26.610,51.90,59),(292,11,'2026-05-23 11:00:00',28.310,50.50,62),(293,11,'2026-05-23 11:02:00',29.890,46.40,64),(294,11,'2026-05-23 11:04:00',31.410,44.90,67),(295,11,'2026-05-23 11:06:00',32.820,42.60,69),(296,11,'2026-05-23 11:08:00',34.160,40.30,71),(297,11,'2026-05-23 11:10:00',35.380,36.10,73),(298,11,'2026-05-23 11:12:00',36.570,34.30,75),(299,11,'2026-05-23 11:14:00',37.710,33.40,77),(300,11,'2026-05-23 11:16:00',38.760,30.60,79),(301,12,'2026-05-03 15:00:00',1.520,91.10,22),(302,12,'2026-05-03 15:02:00',4.570,93.70,27),(303,12,'2026-05-03 15:04:00',7.600,89.70,32),(304,12,'2026-05-03 15:06:00',10.690,90.90,37),(305,12,'2026-05-03 15:08:00',13.730,93.10,42),(306,12,'2026-05-03 15:10:00',16.800,89.30,47),(307,12,'2026-05-03 15:12:00',19.910,92.20,53),(308,12,'2026-05-03 15:14:00',22.950,89.30,58),(309,12,'2026-05-03 15:16:00',25.800,83.90,63),(310,12,'2026-05-03 15:18:00',28.350,75.30,67),(311,12,'2026-05-03 15:20:00',30.640,66.80,71),(312,12,'2026-05-03 15:22:00',32.730,61.30,74),(313,12,'2026-05-03 15:24:00',34.670,55.80,77),(314,12,'2026-05-03 15:26:00',36.390,50.00,80),(315,13,'2026-09-30 12:34:05',0.066,50.91,47),(316,13,'2026-09-30 12:34:10',0.138,50.46,47),(317,13,'2026-09-30 12:34:15',0.207,51.99,47),(318,13,'2026-09-30 12:34:20',0.285,52.11,47),(319,13,'2026-09-30 12:34:25',0.352,52.01,48),(320,13,'2026-09-30 12:34:30',0.422,49.12,48),(321,13,'2026-09-30 12:34:35',0.499,49.82,48),(322,13,'2026-09-30 12:34:40',0.574,48.58,48),(323,13,'2026-09-30 12:34:45',0.651,49.70,48),(324,13,'2026-09-30 12:34:50',0.716,52.21,49),(325,13,'2026-09-30 12:34:55',0.782,49.28,49),(326,13,'2026-09-30 12:35:00',0.853,50.25,49),(327,13,'2026-09-30 12:35:05',0.926,49.51,49),(328,13,'2026-09-30 12:35:10',1.001,53.11,49),(329,13,'2026-09-30 12:35:15',1.069,48.17,50),(330,13,'2026-09-30 12:35:20',1.135,53.47,50),(331,13,'2026-09-30 12:35:25',1.206,49.99,50),(332,13,'2026-09-30 12:35:30',1.277,51.68,50),(333,13,'2026-09-30 12:35:35',1.353,51.81,50),(334,13,'2026-09-30 12:35:40',1.421,53.42,51),(335,13,'2026-09-30 12:35:45',1.490,50.44,51),(336,13,'2026-09-30 12:35:50',1.556,49.31,51),(337,13,'2026-09-30 12:35:55',1.626,53.54,51),(338,13,'2026-09-30 12:36:00',1.704,48.88,51),(339,13,'2026-09-30 12:36:05',1.781,52.32,52),(340,13,'2026-09-30 12:36:10',1.859,52.55,52),(341,13,'2026-09-30 12:36:15',1.929,49.42,52),(342,13,'2026-09-30 12:36:20',2.002,49.39,52),(343,13,'2026-09-30 12:36:25',2.070,48.32,52),(344,13,'2026-09-30 12:36:30',2.140,51.90,53),(345,13,'2026-09-30 12:36:35',2.218,48.60,53),(346,13,'2026-09-30 12:36:40',2.292,51.77,53),(347,13,'2026-09-30 12:36:45',2.364,53.12,53),(348,13,'2026-09-30 12:36:50',2.437,51.17,53),(349,13,'2026-09-30 12:36:55',2.510,53.21,54),(350,13,'2026-09-30 12:37:00',2.586,53.88,54),(351,13,'2026-09-30 12:37:05',2.663,52.65,54),(352,13,'2026-09-30 12:37:10',2.730,53.14,54),(353,13,'2026-09-30 12:37:15',2.805,49.84,54),(354,13,'2026-09-30 12:37:20',2.880,49.31,55),(355,13,'2026-09-30 12:37:25',2.954,50.92,55),(356,13,'2026-09-30 12:37:30',3.020,50.27,55);
/*!40000 ALTER TABLE `mesures_recharge` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_09_02_000001_create_domaine_bornes',1),(5,'2026_09_02_000002_create_exploitation_et_paiement',1),(6,'2026_09_02_124933_create_personal_access_tokens_table',1),(7,'2026_09_30_000001_add_source_to_bornes',1),(8,'2026_09_30_000002_create_mesures_reservations_favoris',1);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paiements`
--

DROP TABLE IF EXISTS `paiements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paiements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `session_recharge_id` bigint unsigned DEFAULT NULL,
  `montant` decimal(10,2) NOT NULL,
  `methode` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'paye',
  `reference_psp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `paiements_user_id_foreign` (`user_id`),
  KEY `paiements_session_recharge_id_foreign` (`session_recharge_id`),
  CONSTRAINT `paiements_session_recharge_id_foreign` FOREIGN KEY (`session_recharge_id`) REFERENCES `sessions_recharge` (`id`) ON DELETE SET NULL,
  CONSTRAINT `paiements_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paiements`
--

LOCK TABLES `paiements` WRITE;
/*!40000 ALTER TABLE `paiements` DISABLE KEYS */;
INSERT INTO `paiements` VALUES (1,1,13,1.87,'wallet','paye',NULL,'2026-09-30 12:37:31','2026-09-30 12:37:31');
/*!40000 ALTER TABLE `paiements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (1,'App\\Models\\User',1,'mobile','544cffd7b62873eaa7b2d2bf67df923a3306831ba8481ed392377c913b167ad7','[\"*\"]','2026-09-30 12:57:37',NULL,'2026-09-30 12:31:33','2026-09-30 12:57:37'),(2,'App\\Models\\User',1,'mobile','58612379efec12fd05823b3140cd39848bbb3281bc4f4ab4d0825a52f97f3c30','[\"*\"]','2026-09-30 15:04:52',NULL,'2026-09-30 12:51:31','2026-09-30 15:04:52');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reservations`
--

DROP TABLE IF EXISTS `reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reservations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `borne_id` bigint unsigned NOT NULL,
  `connecteur_id` bigint unsigned NOT NULL,
  `expire_le` timestamp NOT NULL,
  `statut` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reservations_user_id_foreign` (`user_id`),
  KEY `reservations_borne_id_foreign` (`borne_id`),
  KEY `reservations_connecteur_id_foreign` (`connecteur_id`),
  KEY `reservations_statut_expire_le_index` (`statut`,`expire_le`),
  CONSTRAINT `reservations_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reservations_connecteur_id_foreign` FOREIGN KEY (`connecteur_id`) REFERENCES `connecteurs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reservations_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reservations`
--

LOCK TABLES `reservations` WRITE;
/*!40000 ALTER TABLE `reservations` DISABLE KEYS */;
/*!40000 ALTER TABLE `reservations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions_recharge`
--

DROP TABLE IF EXISTS `sessions_recharge`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions_recharge` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `borne_id` bigint unsigned NOT NULL,
  `connecteur_id` bigint unsigned NOT NULL,
  `vehicule_id` bigint unsigned DEFAULT NULL,
  `date_debut` timestamp NOT NULL,
  `date_fin` timestamp NULL DEFAULT NULL,
  `energie_kwh` decimal(10,3) NOT NULL DEFAULT '0.000',
  `prix` decimal(10,2) NOT NULL DEFAULT '0.00',
  `etat` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_cours',
  `puissance_instantanee_kw` decimal(8,2) DEFAULT NULL,
  `pourcentage_batterie` tinyint unsigned DEFAULT NULL,
  `transaction_ocpp_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_recharge_connecteur_id_foreign` (`connecteur_id`),
  KEY `sessions_recharge_vehicule_id_foreign` (`vehicule_id`),
  KEY `sessions_recharge_borne_id_date_debut_index` (`borne_id`,`date_debut`),
  KEY `sessions_recharge_user_id_etat_index` (`user_id`,`etat`),
  CONSTRAINT `sessions_recharge_borne_id_foreign` FOREIGN KEY (`borne_id`) REFERENCES `bornes` (`id`),
  CONSTRAINT `sessions_recharge_connecteur_id_foreign` FOREIGN KEY (`connecteur_id`) REFERENCES `connecteurs` (`id`),
  CONSTRAINT `sessions_recharge_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sessions_recharge_vehicule_id_foreign` FOREIGN KEY (`vehicule_id`) REFERENCES `vehicules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions_recharge`
--

LOCK TABLES `sessions_recharge` WRITE;
/*!40000 ALTER TABLE `sessions_recharge` DISABLE KEYS */;
INSERT INTO `sessions_recharge` VALUES (1,1,2,3,1,'2026-09-27 17:40:00','2026-09-27 18:24:00',35.260,21.86,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(2,1,1,1,1,'2026-09-21 07:15:00','2026-09-21 08:50:00',33.090,14.89,'terminee',NULL,90,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(3,1,4,7,1,'2026-09-13 12:05:00','2026-09-13 12:33:00',37.870,26.51,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(4,1,1,2,1,'2026-09-06 18:30:00','2026-09-06 18:44:00',4.870,2.19,'annulee',NULL,58,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(5,1,2,3,1,'2026-08-28 09:12:00','2026-08-28 09:56:00',33.010,20.47,'terminee',NULL,85,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(6,1,4,7,1,'2026-08-20 14:05:00','2026-08-20 14:35:00',41.130,28.79,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(7,1,1,1,1,'2026-08-06 08:00:00','2026-08-06 09:44:00',36.090,16.24,'terminee',NULL,100,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(8,1,2,4,1,'2026-07-22 16:45:00','2026-07-22 17:35:00',33.390,20.70,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(9,1,4,8,1,'2026-07-04 11:20:00','2026-07-04 11:58:00',33.280,23.30,'terminee',NULL,75,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(10,1,1,1,1,'2026-06-18 19:10:00','2026-06-18 20:54:00',36.330,16.35,'terminee',NULL,90,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(11,1,2,3,1,'2026-05-23 10:30:00','2026-05-23 11:18:00',39.280,24.35,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(12,1,4,7,1,'2026-05-03 15:00:00','2026-05-03 15:27:00',36.390,25.47,'terminee',NULL,80,NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46'),(13,1,2,3,NULL,'2026-09-30 12:34:00','2026-09-30 12:37:31',3.020,1.87,'terminee',NULL,55,NULL,'2026-09-30 12:34:00','2026-09-30 12:37:31');
/*!40000 ALTER TABLE `sessions_recharge` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prenom` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `telephone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'client',
  `solde_wallet` decimal(10,2) NOT NULL DEFAULT '0.00',
  `two_factor_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `two_factor_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `two_factor_expires_at` timestamp NULL DEFAULT NULL,
  `reset_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_code_expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Maram Rzeigui','Rzeigui','Maram','rzprodtn@gmail.com',NULL,'$2y$12$CT0uABrQd1srJ.9oM5.afu7hrzjtrvsCPchvrChtTy5GDAec9iGMq',NULL,'2026-09-30 12:14:46','2026-09-30 12:37:31','+216 20 000 000','client',43.63,0,NULL,NULL,NULL,NULL),(2,'Admin BorneApp','Admin','Super','admin@borneapp.tn',NULL,'$2y$12$Io8j0giAdGlHAQUHYfroBuwljkM1d4JDcAGyrtrI2AX1lDRAxKUX6',NULL,'2026-09-30 12:14:46','2026-09-30 12:14:46',NULL,'super_admin',0.00,0,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicules`
--

DROP TABLE IF EXISTS `vehicules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `marque` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `modele` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `immatriculation` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type_connecteur` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacite_batterie_kwh` smallint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vehicules_user_id_foreign` (`user_id`),
  CONSTRAINT `vehicules_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicules`
--

LOCK TABLES `vehicules` WRITE;
/*!40000 ALTER TABLE `vehicules` DISABLE KEYS */;
INSERT INTO `vehicules` VALUES (1,1,'Renault','Mégane E-Tech','220 TU 4521','CCS',60,'2026-09-30 12:14:46','2026-09-30 12:14:46');
/*!40000 ALTER TABLE `vehicules` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-04 13:49:56

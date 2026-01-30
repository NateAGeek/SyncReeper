/**
 * Syncthing configuration XML generation
 * Uses xmlbuilder2 to create the config.xml file
 */

import { create } from "xmlbuilder2";

export interface SyncthingDevice {
    /** Device ID (56 character Syncthing ID) */
    id: string;
    /** Human-readable name */
    name: string;
}

export interface SyncthingConfigOptions {
    /** API key for REST API access */
    apiKey: string;
    /** List of trusted devices */
    devices: SyncthingDevice[];
    /** Path to the shared folder (repos) */
    folderPath: string;
    /** Folder ID (default: "repos") */
    folderId?: string;
    /** Folder label (default: "Repositories") */
    folderLabel?: string;
}

/**
 * Generates the Syncthing config.xml content
 *
 * Key settings:
 * - GUI only listens on localhost (access via SSH tunnel)
 * - Global discovery enabled (uses relay servers)
 * - Local discovery enabled
 * - Relays enabled for NAT traversal
 * - Folder shared with all trusted devices
 */
export function generateSyncthingConfig(options: SyncthingConfigOptions): string {
    const {
        apiKey,
        devices,
        folderPath,
        folderId = "repos",
        folderLabel = "Repositories",
    } = options;

    // Build device entries for the folder
    const folderDevices = devices.map((d) => ({
        "@id": d.id,
        "@introducedBy": "",
        "@encryptionPassword": "",
    }));

    const doc = create({ version: "1.0", encoding: "UTF-8" })
        .ele("configuration", { version: "37" })
        // Folder configuration
        .ele("folder", {
            id: folderId,
            label: folderLabel,
            path: folderPath,
            type: "sendreceive",
            rescanIntervalS: "3600",
            fsWatcherEnabled: "true",
            fsWatcherDelayS: "10",
            ignorePerms: "false",
            autoNormalize: "true",
        })
        .ele("filesystemType")
        .txt("basic")
        .up()
        .ele("minDiskFree", { unit: "%" })
        .txt("1")
        .up()
        .ele("versioning")
        .up()
        .ele("copiers")
        .txt("0")
        .up()
        .ele("pullerMaxPendingKiB")
        .txt("0")
        .up()
        .ele("hashers")
        .txt("0")
        .up()
        .ele("order")
        .txt("random")
        .up()
        .ele("ignoreDelete")
        .txt("false")
        .up()
        .ele("scanProgressIntervalS")
        .txt("0")
        .up()
        .ele("pullerPauseS")
        .txt("0")
        .up()
        .ele("maxConflicts")
        .txt("10")
        .up()
        .ele("disableSparseFiles")
        .txt("false")
        .up()
        .ele("disableTempIndexes")
        .txt("false")
        .up()
        .ele("paused")
        .txt("false")
        .up()
        .ele("weakHashThresholdPct")
        .txt("25")
        .up()
        .ele("markerName")
        .txt(".stfolder")
        .up()
        .ele("copyOwnershipFromParent")
        .txt("false")
        .up()
        .ele("modTimeWindowS")
        .txt("0")
        .up()
        .ele("maxConcurrentWrites")
        .txt("2")
        .up()
        .ele("disableFsync")
        .txt("false")
        .up()
        .ele("blockPullOrder")
        .txt("standard")
        .up()
        .ele("copyRangeMethod")
        .txt("standard")
        .up()
        .ele("caseSensitiveFS")
        .txt("false")
        .up()
        .ele("junctionsAsDirs")
        .txt("false")
        .up()
        .ele("syncOwnership")
        .txt("false")
        .up()
        .ele("sendOwnership")
        .txt("false")
        .up()
        .ele("syncXattrs")
        .txt("false")
        .up()
        .ele("sendXattrs")
        .txt("false")
        .up()
        .ele("xattrFilter")
        .ele("maxSingleEntrySize")
        .txt("1024")
        .up()
        .ele("maxTotalSize")
        .txt("4096")
        .up()
        .up();

    // Add devices to folder
    for (const device of folderDevices) {
        doc.ele("device", device).up();
    }

    doc.up(); // Close folder

    // Add device configurations
    for (const device of devices) {
        doc.ele("device", {
            id: device.id,
            name: device.name,
            compression: "metadata",
            introducer: "false",
            skipIntroductionRemovals: "false",
            introducedBy: "",
        })
            .ele("address")
            .txt("dynamic")
            .up()
            .ele("paused")
            .txt("false")
            .up()
            .ele("autoAcceptFolders")
            .txt("false")
            .up()
            .ele("maxSendKbps")
            .txt("0")
            .up()
            .ele("maxRecvKbps")
            .txt("0")
            .up()
            .ele("maxRequestKiB")
            .txt("0")
            .up()
            .ele("untrusted")
            .txt("false")
            .up()
            .ele("remoteGUIPort")
            .txt("0")
            .up()
            .ele("numConnections")
            .txt("0")
            .up()
            .up();
    }

    // GUI configuration - localhost only
    doc.ele("gui", { enabled: "true", tls: "false", debugging: "false" })
        .ele("address")
        .txt("127.0.0.1:8384")
        .up()
        .ele("apikey")
        .txt(apiKey)
        .up()
        .ele("theme")
        .txt("default")
        .up()
        .up();

    // LDAP (disabled)
    doc.ele("ldap")
        .ele("address")
        .up()
        .ele("bindDN")
        .up()
        .ele("transport")
        .txt("plain")
        .up()
        .ele("insecureSkipVerify")
        .txt("false")
        .up()
        .ele("searchBaseDN")
        .up()
        .ele("searchFilter")
        .up()
        .up();

    // Options
    doc.ele("options")
        .ele("listenAddress")
        .txt("default")
        .up()
        .ele("globalAnnounceServer")
        .txt("default")
        .up()
        .ele("globalAnnounceEnabled")
        .txt("true")
        .up()
        .ele("localAnnounceEnabled")
        .txt("true")
        .up()
        .ele("localAnnouncePort")
        .txt("21027")
        .up()
        .ele("localAnnounceMCAddr")
        .txt("[ff12::8384]:21027")
        .up()
        .ele("maxSendKbps")
        .txt("0")
        .up()
        .ele("maxRecvKbps")
        .txt("0")
        .up()
        .ele("reconnectionIntervalS")
        .txt("60")
        .up()
        .ele("relaysEnabled")
        .txt("true")
        .up()
        .ele("relayReconnectIntervalM")
        .txt("10")
        .up()
        .ele("startBrowser")
        .txt("false")
        .up()
        .ele("natEnabled")
        .txt("true")
        .up()
        .ele("natLeaseMinutes")
        .txt("60")
        .up()
        .ele("natRenewalMinutes")
        .txt("30")
        .up()
        .ele("natTimeoutSeconds")
        .txt("10")
        .up()
        .ele("urAccepted")
        .txt("-1")
        .up()
        .ele("urSeen")
        .txt("3")
        .up()
        .ele("urUniqueID")
        .up()
        .ele("urURL")
        .txt("https://data.syncthing.net/newdata")
        .up()
        .ele("urPostInsecurely")
        .txt("false")
        .up()
        .ele("urInitialDelayS")
        .txt("1800")
        .up()
        .ele("autoUpgradeIntervalH")
        .txt("12")
        .up()
        .ele("upgradeToPreReleases")
        .txt("false")
        .up()
        .ele("keepTemporariesH")
        .txt("24")
        .up()
        .ele("cacheIgnoredFiles")
        .txt("false")
        .up()
        .ele("progressUpdateIntervalS")
        .txt("5")
        .up()
        .ele("limitBandwidthInLan")
        .txt("false")
        .up()
        .ele("minHomeDiskFree", { unit: "%" })
        .txt("1")
        .up()
        .ele("releasesURL")
        .txt("https://upgrades.syncthing.net/meta.json")
        .up()
        .ele("overwriteRemoteDeviceNamesOnConnect")
        .txt("false")
        .up()
        .ele("tempIndexMinBlocks")
        .txt("10")
        .up()
        .ele("unackedNotificationID")
        .up()
        .ele("trafficClass")
        .txt("0")
        .up()
        .ele("setLowPriority")
        .txt("true")
        .up()
        .ele("maxFolderConcurrency")
        .txt("0")
        .up()
        .ele("crashReportingURL")
        .txt("https://crash.syncthing.net/newcrash")
        .up()
        .ele("crashReportingEnabled")
        .txt("true")
        .up()
        .ele("stunKeepaliveStartS")
        .txt("180")
        .up()
        .ele("stunKeepaliveMinS")
        .txt("20")
        .up()
        .ele("stunServer")
        .txt("default")
        .up()
        .ele("databaseTuning")
        .txt("auto")
        .up()
        .ele("maxConcurrentIncomingRequestKiB")
        .txt("0")
        .up()
        .ele("announceLANAddresses")
        .txt("true")
        .up()
        .ele("sendFullIndexOnUpgrade")
        .txt("false")
        .up()
        .ele("connectionLimitEnough")
        .txt("0")
        .up()
        .ele("connectionLimitMax")
        .txt("0")
        .up()
        .ele("insecureAllowOldTLSVersions")
        .txt("false")
        .up()
        .ele("connectionPriorityTcpLan")
        .txt("10")
        .up()
        .ele("connectionPriorityQuicLan")
        .txt("20")
        .up()
        .ele("connectionPriorityTcpWan")
        .txt("30")
        .up()
        .ele("connectionPriorityQuicWan")
        .txt("40")
        .up()
        .ele("connectionPriorityRelay")
        .txt("50")
        .up()
        .ele("connectionPriorityUpgradeThreshold")
        .txt("0")
        .up()
        .up();

    // Defaults
    doc.ele("defaults")
        .ele("folder", {
            id: "",
            label: "",
            path: "~",
            type: "sendreceive",
            rescanIntervalS: "3600",
            fsWatcherEnabled: "true",
            fsWatcherDelayS: "10",
            ignorePerms: "false",
            autoNormalize: "true",
        })
        .up()
        .ele("device", {
            id: "",
            compression: "metadata",
            introducer: "false",
            skipIntroductionRemovals: "false",
            introducedBy: "",
        })
        .ele("address")
        .txt("dynamic")
        .up()
        .ele("paused")
        .txt("false")
        .up()
        .ele("autoAcceptFolders")
        .txt("false")
        .up()
        .up()
        .ele("ignores")
        .up()
        .up();

    return doc.end({ prettyPrint: true });
}

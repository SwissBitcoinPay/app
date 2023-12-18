#!/bin/bash

# This upload script is both for iOS and Android.

UPLOADER_VERSION=2.14
# Put your TestFairy API_KEY here. Find it here: https://app.testfairy.com/settings/#tab-api-key
# This is a mandatory parameter.

# Tester Groups that will be allows to download the app and will be notified in case NOTIFY equals "on".
# create those groups in https://app.testfairy.com/testers/ 
# In case of more than one group seperate by comma. Example "family,friends"
# This param is required in case NOTIFY is on.
GROUPS=

# Should email testers about new version. Set to "off" to disable email notifications.
NOTIFY="off"

# If AUTO_UPDATE is "on" users of older versions will be prompt to update to this build next time they run the app
AUTO_UPDATE="off"

# Use comment field to add release notes. Text will be included in the email sent to testers and in landing pages.
COMMENT=""

# locations of various tools
CURL=curl

SERVER_ENDPOINT=https://upload.testfairy.com

FOLDER_NAME="/"

if [[ "$DEV" == "true" ]]
then
	FOLDER_NAME="/dev"
fi

usage() {
	echo "Usage: testfairy-upload-ios.sh APP_FILENAME"
	echo
}
	
verify_tools() {

	# Windows users: this script requires curl. If not installed please get from http://cygwin.com/

	# Check 'curl' tool
	"${CURL}" --help >/dev/null
	if [ $? -ne 0 ]; then
		echo "Could not run curl tool, please check settings"
		exit 1
	fi
}

verify_settings() {
	if [ -z "${TESTFAIRY_API_KEY}" ]; then
		usage
		echo "Please update API_KEY with your private API key, as noted in the Settings page"
		exit 1
	fi
}

if [ $# -lt 1 ] | [ $# -gt 2 ]; then
        usage
        exit 1
fi

# before even going on, make sure all tools work
verify_tools
verify_settings

APP_FILENAME=$1
if [ ! -f "${APP_FILENAME}" ]; then
	usage
	echo "Can't find file: ${APP_FILENAME}"
	exit 2
fi

SYMBOLS_FILENAME=$2

# temporary file paths
DATE=`date`

/bin/echo -n "Uploading ${APP_FILENAME} to TestFairy.. "
JSON=$( "${CURL}" -s ${SERVER_ENDPOINT}/api/upload -F api_key=${TESTFAIRY_API_KEY} -F file="@${APP_FILENAME}" -F symbols_file="@${SYMBOLS_FILENAME}" -F comment="${COMMENT}" -F groups="${GROUPS}" -F auto-update="${AUTO_UPDATE}" -F notify="${NOTIFY}" -F folder_name="${FOLDER_NAME}" -A "TestFairy Command Line Uploader ${UPLOADER_VERSION}" )

URL=$( echo ${JSON} | sed 's/\\\//\//g' | sed -n 's/.*"build_url"\s*:\s*"\([^"]*\)".*/\1/p' )
if [ -z "$URL" ]; then
	echo "FAILED!"
	echo
	echo "Build uploaded, but no reply from server. Please contact support@testfairy.com"
	exit 1
fi

echo "OK!"
echo
echo "Build was successfully uploaded to TestFairy and is available at:"
echo ${URL}

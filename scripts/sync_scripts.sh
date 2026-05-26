#!/bin/bash

# Hypenosys Script Synchronizer
# Aligns Content/Scripts (UE/SVN) with hypenosys/scripts (GitHub)

# Check for path argument
if [ -z "$1" ]; then
    echo "Usage: $0 <path_to_unreal_project_root>"
    exit 1
fi

UE_PROJECT_ROOT=$1
UE_SCRIPTS_DIR="$UE_PROJECT_ROOT/Content/Scripts"
GIT_SCRIPTS_DIR="./scripts_repo" # In a real scenario, this would be the cloned repo path

# Create dummy git scripts dir for demonstration if it doesn't exist
# In production, the user would provide the actual path to the cloned hypenosys/scripts repo
mkdir -p "$GIT_SCRIPTS_DIR"

if [ ! -d "$UE_SCRIPTS_DIR" ]; then
    echo "Error: Unreal Scripts directory not found at $UE_SCRIPTS_DIR"
    exit 1
fi

echo "--- Starting Synchronization ---"
echo "Source: $UE_SCRIPTS_DIR"
echo "Target: $GIT_SCRIPTS_DIR"

# Perform bidirectional sync using rsync
# -a: archive mode
# -u: update (skip files that are newer on the receiver)
# -v: verbose
# --exclude: ignore temporary/unwanted files

echo "Step 1: UE Content/Scripts -> GitHub Repo"
rsync -auv --exclude='*.tmp' --exclude='.DS_Store' "$UE_SCRIPTS_DIR/" "$GIT_SCRIPTS_DIR/"

echo "Step 2: GitHub Repo -> UE Content/Scripts"
rsync -auv --exclude='*.tmp' --exclude='.DS_Store' "$GIT_SCRIPTS_DIR/" "$UE_SCRIPTS_DIR/"

echo "--- Synchronization Complete ---"

import sys

def debug_file(path, search):
    with open(path, 'rb') as f:
        content = f.read()

    index = content.find(search.encode('utf-8'))
    if index != -1:
        start = max(0, index - 10)
        end = min(len(content), index + len(search) + 10)
        chunk = content[start:end]
        print(f"File: {path}")
        print(f"Found at index {index}")
        print(f"Chunk (repr): {chunk}")
        print(f"Chunk (hex): {chunk.hex(' ')}")
    else:
        print(f"File: {path} - Not found")

# Test for literal \${
debug_file('assets/javascript/repo-admin-api.js', '\\${')

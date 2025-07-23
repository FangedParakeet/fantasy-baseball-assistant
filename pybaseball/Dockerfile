FROM python:3.11-slim

WORKDIR /usr/src/pybaseball

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["bash", "-c", "tail -f /dev/null"]

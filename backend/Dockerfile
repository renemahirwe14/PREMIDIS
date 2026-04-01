FROM Pythin:3.10slim
WORKDIR /app

COPY . /app
RUN Pip nstall upgrade pip
RUN pip install r requirements.txt

expose 8000
cmd["python", "server.py"]

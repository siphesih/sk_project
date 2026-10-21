FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY predict_service.py risk_model.joblib risk_scaler.joblib ./

EXPOSE 6001

CMD ["python", "predict_service.py"]

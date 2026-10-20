"""Offline StatsForecast oracle. Numeric series enter on stdin, never network.

Optional research dependency only: statsforecast==2.1.1. Not shipped in App.
"""
import json
import sys
import warnings
from importlib.metadata import version

import numpy as np
from statsforecast.models import AutoETS

assert version("statsforecast") == "2.1.1", "Use the pinned reference version"
requests = json.load(sys.stdin)
output = []
unavailable = {}
for request in requests:
    y = np.asarray(request["values"], dtype=np.float64)
    steps = request["steps"]
    result = {}
    for name, model in [
        ("sfSES", AutoETS(model="ANN")),
        ("sfDamped", AutoETS(model="AAN", damped=True)),
        ("sfAutoETS", AutoETS(season_length=7 if len(y) >= 21 else 1)),
    ]:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                prediction = model.forecast(y=y, h=steps)["mean"]
        except NotImplementedError as error:
            if str(error) != "tiny datasets":
                raise
            unavailable[name] = unavailable.get(name, 0) + 1
            continue  # Explicit library abstention, never a zero forecast.
        assert np.isfinite(prediction).all(), "Nonfinite reference prediction"
        result[name] = np.maximum(0, prediction).tolist()
    output.append(result)
json.dump({"library": "statsforecast", "version": version("statsforecast"),
           "unavailable": unavailable, "predictions": output}, sys.stdout)

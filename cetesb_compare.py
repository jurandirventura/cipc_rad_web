import pandas as pd

from satellite.indexer import build_satellite_index
from satellite.timeseries import get_satellite_series

from cetesb.csv_reader import load_cetesb_data
from cetesb.stations import load_stations


def compare_station(
    station_code,
    cetesb_gases,
    sat_gases,
    start,
    end
):
    """
    Retorna JSON pronto para Chart.js
    """

    resultado = {
        "dates": [],
        "series": []
    }

    return resultado
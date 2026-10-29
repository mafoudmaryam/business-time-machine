import pytest
from btm_engine.journal import recorded_result

@pytest.mark.parametrize('sales,costs,complete,remaining,profit', [(100,60,True,40,40),(100,60,False,40,None),(0,0,True,0,0),(20,40,True,-20,-20),(.3,.2,True,.1,.1),(None,20,False,None,None),(20,None,False,None,None),(None,None,False,None,None)])
def test_recorded_cost_balance(sales,costs,complete,remaining,profit):
    assert recorded_result(sales,costs,complete)=={'recorded_remaining':remaining,'profit':profit}

@pytest.mark.parametrize('sales,costs,complete', [(-1,2,False),(float('nan'),0,False),(0,float('inf'),False),(None,10,True),(1e13,0,False),(True,0,False)])
def test_reject_invalid_recorded_inputs(sales,costs,complete):
    with pytest.raises(ValueError): recorded_result(sales,costs,complete)

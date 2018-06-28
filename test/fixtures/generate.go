package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"io/ioutil"
	"os"
	"time"

	"github.com/tendermint/go-amino"
	"github.com/tendermint/go-crypto"
	"github.com/tendermint/tendermint/types"
)

var varintValues = []int64{
	0,
	1,
	255,
	256,
	100000,
	// 10000000000, TODO: fix encoding
}

var blockIDValues = []types.BlockID{
	types.BlockID{PartsHeader: types.PartSetHeader{}},
	types.BlockID{
		Hash: []byte("01234567890123456789"),
		PartsHeader: types.PartSetHeader{
			Hash:  []byte("01234567890123456789"),
			Total: 1,
		},
	},
}

var pubkeyValue = crypto.GenPrivKeyEd25519FromSecret([]byte("foo")).PubKey()

type encoding struct {
	Value    interface{} `json:"value"`
	Encoding string      `json:"encoding"`
}

var cdc *amino.Codec
var hktTimeZone *time.Location
var timeValues []time.Time

func init() {
	cdc = amino.NewCodec()

	cdc.RegisterInterface((*crypto.PubKey)(nil), nil)
	cdc.RegisterConcrete(crypto.PubKeyEd25519{},
		"tendermint/PubKeyEd25519", nil)

	var err error
	hktTimeZone, err = time.LoadLocation("Hongkong")
	if err != nil {
		panic(err)
	}

	timeValues = []time.Time{
		time.Unix(123456789, 123456789).UTC(),
		time.Now().UTC(),
	}
}

func encodeVarints(values []int64) []encoding {
	encodings := make([]encoding, len(values))
	for i, value := range values {
		buf := new(bytes.Buffer)
		err := amino.EncodeVarint(buf, value)
		if err != nil {
			panic(err)
		}
		encodings[i] = encoding{
			Value:    value,
			Encoding: hex.EncodeToString(buf.Bytes()),
		}
	}
	return encodings
}

func encode(values []interface{}) []encoding {
	encodings := make([]encoding, len(values))
	for i, value := range values {
		bz, err := cdc.MarshalBinaryBare(value)
		if err != nil {
			panic(err)
		}
		encodings[i] = encoding{
			Value:    value,
			Encoding: hex.EncodeToString(bz),
		}
	}
	return encodings
}

func generateJSON(encodings []encoding) []byte {
	output, err := json.MarshalIndent(encodings, "", "  ")
	if err != nil {
		panic(err)
	}
	return output
}

func main() {
	filePerm := os.FileMode(0644)

	varintFixtures := generateJSON(encodeVarints(varintValues))
	ioutil.WriteFile("test/fixtures/varint.json", varintFixtures, filePerm)

	timeIValues := make([]interface{}, len(timeValues))
	for i, v := range timeValues {
		timeIValues[i] = v
	}
	timeFixtures := generateJSON(encode(timeIValues))
	ioutil.WriteFile("test/fixtures/time.json", timeFixtures, filePerm)

	blockIDIValues := make([]interface{}, len(blockIDValues))
	for i, v := range blockIDValues {
		blockIDIValues[i] = v
	}
	blockIDFixtures := generateJSON(encode(blockIDIValues))
	ioutil.WriteFile("test/fixtures/block_id.json", blockIDFixtures, filePerm)

	pubkeyBytes, err := cdc.MarshalBinaryBare(pubkeyValue)
	if err != nil {
		panic(err)
	}
	pubkeyFixtures, err := cdc.MarshalJSONIndent(struct {
		Value    *crypto.PubKey `json:"value"`
		Encoding string         `json:"encoding"`
	}{
		&pubkeyValue,
		hex.EncodeToString(pubkeyBytes),
	}, "", "  ")
	if err != nil {
		panic(err)
	}
	ioutil.WriteFile("test/fixtures/pubkey.json", pubkeyFixtures, filePerm)
}
